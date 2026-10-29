"""
Answering a question (docs/SUPPORT.md).

1. Retrieval: BM25 over the notes (assistant.knowledge), with accents folded
   and words lightly stemmed, so "paiement", "payer" and "pay" meet.
2. Wording: when CF_AI_ACCOUNT_ID and CF_AI_TOKEN are set, a small model on
   Cloudflare Workers AI (free daily allowance) writes the answer from the
   best notes only. Past ASSISTANT_DAILY_LIMIT, without a key, or on any
   error, the best note itself is the answer.

It never invents: no notes, no answer, and the person is offered Younes.
"""

import logging
import math
import re
import unicodedata
from collections import Counter

import httpx
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from .knowledge import Note, notes

logger = logging.getLogger("originforge.assistant")

STOP = set("""
a an and are as at be but by can do does for from get have how i if in is it me my of on or so than that the then there
this to was we what when where which who why will with you your yours am im i'm want need please
le la les un une des de du et est en au aux pour par sur dans que qui quoi quel quelle quels quelles comment combien
je j vous tu il elle on nous mon ma mes votre vos ton ta tes ce cet cette ces est-ce y a ai avez peut puis faire fait
""".split())
MIN_SCORE = 1.2


def fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def stem(word: str) -> str:
    for end in ("ements", "ement", "ations", "ation", "ments", "ment", "ings", "ing", "ies", "es", "s", "er", "ez", "ed", "e"):
        if len(word) > len(end) + 3 and word.endswith(end):
            return word[: -len(end)]
    return word


def terms(text: str) -> list[str]:
    return [stem(w) for w in re.findall(r"[a-z0-9]+", fold(text)) if w not in STOP and len(w) > 1]


def rank(question: str, pool: list[Note], k1=1.4, b=0.7) -> list[tuple[float, Note]]:
    docs = [terms(f"{n.title} {n.title} {n.text} {' '.join(n.tags * 2)}") for n in pool]
    if not docs:
        return []
    avg = sum(len(d) for d in docs) / len(docs)
    df = Counter(t for d in docs for t in set(d))
    query = set(terms(question))
    scored = []
    for note, doc in zip(pool, docs):
        tf = Counter(doc)
        score = 0.0
        for t in query:
            if not tf[t]:
                continue
            idf = math.log(1 + (len(docs) - df[t] + 0.5) / (df[t] + 0.5))
            score += idf * tf[t] * (k1 + 1) / (tf[t] + k1 * (1 - b + b * len(doc) / avg))
        scored.append((score, note))
    return sorted(scored, key=lambda x: -x[0])


def _model_budget_left() -> bool:
    key = f"assistant:model:{timezone.localdate().isoformat()}"
    used = cache.get_or_set(key, 0, 60 * 60 * 26)
    if used >= settings.ASSISTANT_DAILY_LIMIT:
        return False
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, 60 * 60 * 26)
    return True


SYSTEM = {
    "en": ("You are the assistant on originforgedev.com, the studio of Younes Ouali, a full-stack developer who builds web "
           "platforms, websites, mobile apps, Windows software, automation and product films. Answer the visitor's question "
           "using only the notes below. Be warm, plain and short: at most 110 words, no lists unless steps are asked for. "
           "Never invent prices, dates, discounts or promises that are not in the notes. If the notes do not answer it, say "
           "so in one sentence and suggest talking to Younes. Reply in English."),
    "fr": ("Tu es l'assistant de originforgedev.com, le studio de Younes Ouali, développeur full-stack qui crée des "
           "plateformes web, sites, applications mobiles, logiciels Windows, automatisations et films produits. Réponds à la "
           "question du visiteur uniquement avec les notes ci-dessous. Sois chaleureux, simple et bref : 110 mots au plus, "
           "pas de listes sauf pour des étapes. N'invente jamais de prix, de dates, de remises ou de promesses absents des "
           "notes. Si les notes ne répondent pas, dis-le en une phrase et propose de parler à Younes. Vouvoie la personne. "
           "Réponds en français."),
}


def _model_answer(lang: str, question: str, history: list[dict], found: list[Note]) -> str | None:
    account, token = settings.CF_AI_ACCOUNT_ID, settings.CF_AI_TOKEN
    if not account or not token or not _model_budget_left():
        return None
    context = "\n\n".join(f"[{n.title}]\n{n.text}" for n in found)
    messages = [{"role": "system", "content": f"{SYSTEM[lang]}\n\nNotes:\n{context}"}]
    for turn in history[-6:]:
        messages.append({"role": "assistant" if turn.get("role") == "assistant" else "user", "content": str(turn.get("text", ""))[:600]})
    messages.append({"role": "user", "content": question[:800]})
    try:
        res = httpx.post(
            f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{settings.ASSISTANT_MODEL}",
            headers={"Authorization": f"Bearer {token}"}, json={"messages": messages, "max_tokens": 320, "temperature": 0.3},
            timeout=15,
        )
        res.raise_for_status()
        text = (res.json().get("result") or {}).get("response", "").strip()
        return text or None
    except Exception as exc:  # the notes still answer
        logger.warning("Assistant model failed: %s", exc)
        return None


HANDOFF = {
    "en": "I'm not sure about that one. Younes can answer you himself: tap \"Talk to Younes\" and he'll reply in your messages.",
    "fr": "Je ne suis pas sûr pour celle-ci. Younes peut vous répondre lui-même : touchez « Parler à Younes » et il vous répondra dans vos messages.",
}


def answer(question: str, lang: str = "en", history: list[dict] | None = None) -> dict:
    lang = lang if lang in SYSTEM else "en"
    question = question.strip()[:800]
    ranked = [(s, n) for s, n in rank(question, notes(lang)) if s > 0]
    if not ranked or ranked[0][0] < MIN_SCORE:
        return {"answer": HANDOFF[lang], "sources": [], "film": "", "handoff": True, "engine": "notes"}
    best = [n for s, n in ranked[:4] if s >= ranked[0][0] * 0.35]
    text = _model_answer(lang, question, history or [], best)
    engine = "model" if text else "notes"
    if not text:
        text = best[0].text
    top = best[0]
    sources = [{"title": n.title, "url": n.url} for n in best[:3] if n.url]
    # A film goes with the answer when one of the two closest notes has one (the how-to for "how do I start").
    film = next((n.film for n in best[:2] if n.film), "")
    return {"answer": text, "sources": sources, "film": film, "handoff": False, "engine": engine, "topic": top.key}
