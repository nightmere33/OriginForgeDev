"""
Cut web-ready media from Younes's source videos, screenshots and brand files.

    python scripts/media/build_media.py [--only galaxy|covers|films|clips|stills|logos] [--force]

Every video comes out twice, from the same source:
  <name>-web.mp4  H.264, the universal file every browser plays
  <name>-av1.mp4  AV1, ~35-55 % smaller at the same quality (SSIM-matched),
                  served only to devices that decode AV1 efficiently
Loops are silent and 24 fps (like getartcraft.com's 640x360 galaxy clips);
films keep their sound. Outputs land in backend/media/work/ with manifest.json,
which `manage.py seed_site` attaches to the case studies.
"""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PROJECTS = REPO.parents[1]  # …/AndroidStudioProjects
PICS = REPO.parent / "project pics"
OUT = REPO / "backend" / "media" / "work"

PROMO = PROJECTS / "originforge-promo/output/v4/OriginForge-Promo-EN-v4.mp4"
MEDIGATE = PROJECTS / "medigate-ad/out/MediGate-Pub-FR.mp4"
ALQ_DIR = PROJECTS / "alquilar/ADS/Alquilar-ad-project/Airbnb Project file/Airbnb Project file"
ALQ_HOST = ALQ_DIR / "Alquilar-output/Alquilar-Host-Reel-v2-Brian.mp4"
ALQ_GOAL = ALQ_DIR / "Alquilar-output/Alquilar-Goal-Visual-Preview.mp4"
ALQ_PHOTOS = PROJECTS / "alquilar/Marketing photos"
# The 20-episode feature series (1080x1920, voice-over): every screen of the Flutter app.
ALQ_SERIES = ALQ_DIR / "Alquilar-output/Alquilar-Series"
# Raw captures of the Flutter app (build 48, emulator 1080x2400, demo data).
ALQ_APP = PROJECTS / "alquilar/marketing"
ALQ_WEB = PROJECTS / "alquilar/ADS/website captures/desktop reference"
MG_SHOTS = PROJECTS / "wadoud_quiz/marketing/video-brief/screenshots"
MG_BRAND = PROJECTS / "wadoud_quiz/brand"
GV_ZIP = PICS / "GameVerse_feature_clips.zip"
# The CSI game's Unity Recorder captures (1920x1080, 30 fps, with sound).
CSI_REC = Path.home() / "OneDrive/Documents/Unity 6 Projects/CSI GAME 2/Recordings"


def ep(folder: str, name: str) -> Path:
    """One English episode of the Alquilar series."""
    return ALQ_SERIES / folder / f"Alquilar-{name}-EN.mp4"


ALQ_DASH = ep("02 Host - Dashboard", "02-Host-Dashboard")
ALQ_CAL = ep("06 Host - Calendar", "06-Host-Calendar")
ALQ_FIND = ep("10 Guest - Find a stay", "10-Guest-Find-a-stay")
ALQ_LISTING = ep("12 Guest - The listing page", "12-Guest-Listing-page")
ALQ_BOOK = ep("13 Guest - Booking", "13-Guest-Booking")


def span(src, start, dur) -> dict:
    """Where a cut comes from, so the seed can keep one page from showing the same seconds twice.
    `start` None means the whole recording."""
    name = src if isinstance(src, str) else Path(src).name
    if start is None:
        return {"src": name, "start": 0.0, "end": None}
    return {"src": name, "start": float(start), "end": float(start) + float(dur or 0)}

# (name, source, start s, duration s, project slug). Picked from contact sheets.
# GameVerse sources are names inside GV_ZIP.
GALAXY = [
    ("of-ignite", PROMO, 3.0, 5.0, "product-films"),
    ("of-name", PROMO, 6.5, 5.0, "product-films"),
    ("of-build", PROMO, 17.0, 5.5, "product-films"),
    ("of-medigate", PROMO, 27.5, 5.0, "medigate"),
    ("of-alquilar", PROMO, 39.0, 5.5, "alquilar"),
    ("of-stores", PROMO, 48.0, 6.0, "product-films"),
    ("mg-intro", MEDIGATE, 6.0, 5.0, "medigate"),
    ("mg-series", MEDIGATE, 15.0, 5.5, "medigate"),
    ("mg-highlight", MEDIGATE, 24.0, 5.0, "medigate"),
    ("mg-xp", MEDIGATE, 33.0, 5.0, "medigate"),
    ("mg-trophies", MEDIGATE, 39.0, 5.0, "medigate"),
    ("mg-end", MEDIGATE, 57.0, 5.0, "medigate"),
    ("alq-price", ALQ_HOST, 0.0, 5.0, "alquilar"),
    ("alq-book", ALQ_HOST, 21.0, 4.5, "alquilar"),
    ("alq-pay", ALQ_HOST, 24.0, 5.0, "alquilar"),
    ("alq-paid", ALQ_HOST, 30.0, 5.5, "alquilar"),
    ("alq-brand", ALQ_HOST, 36.0, 5.5, "alquilar"),
    ("gv-catalog", "02_catalog_search_and_details.mp4", 1.0, 6.0, "gameverse"),
    ("gv-cart", "04_cart_and_checkout.mp4", 0.5, 6.0, "gameverse"),
    ("csi-beast", CSI_REC / "Movie_032.mp4", 21.0, 6.0, "csi-game"),
    ("csi-fire", CSI_REC / "Movie_030.mp4", 2.0, 6.0, "csi-game"),
    # Landscape, colourful footage reads best as a small card (getartcraft.com's are all 16:9).
    ("csi-pillars", CSI_REC / "Movie_005.mp4", 1.0, 5.0, "csi-game"),
    ("csi-demon", CSI_REC / "Movie_010.mp4", 4.0, 5.0, "csi-game"),
    ("csi-forest", CSI_REC / "Movie_014.mp4", 1.0, 5.0, "csi-game"),
    ("csi-spikes", CSI_REC / "Movie_028.mp4", 0.5, 5.0, "csi-game"),
    ("gv-home", "01_homepage_tour.mp4", 2.0, 5.5, "gameverse"),
    ("gv-listing", "06_seller_listing.mp4", 3.0, 5.5, "gameverse"),
    ("gv-profile", "03_login_and_profile.mp4", 2.0, 5.0, "gameverse"),
    # Alquilar series, picked from contact sheets (Oct 2026).
    ("alq-dash", ALQ_DASH, 3.0, 5.5, "alquilar"),
    ("alq-earnings", ALQ_DASH, 12.0, 5.0, "alquilar"),
    ("alq-homes", ALQ_DASH, 27.0, 5.0, "alquilar"),
    ("alq-explore", ALQ_FIND, 3.0, 5.5, "alquilar"),
    ("alq-where", ALQ_FIND, 12.0, 5.0, "alquilar"),
    ("alq-when", ALQ_FIND, 18.0, 5.0, "alquilar"),
    ("alq-map", ALQ_FIND, 24.0, 5.0, "alquilar"),
    ("alq-dates", ALQ_BOOK, 3.0, 5.0, "alquilar"),
    ("alq-total", ALQ_BOOK, 18.0, 5.0, "alquilar"),
    ("alq-held", ALQ_BOOK, 30.0, 5.0, "alquilar"),
    ("alq-nights", ALQ_CAL, 6.0, 5.5, "alquilar"),
    ("alq-photos", ALQ_LISTING, 3.0, 5.0, "alquilar"),
]

COVERS = [
    ("cover-alquilar", ALQ_HOST, 9.0, 9.0, "alquilar"),
    ("cover-medigate", MEDIGATE, 15.0, 9.0, "medigate"),
    ("cover-films", PROMO, 2.5, 9.0, "product-films"),
    ("cover-gameverse", "01_homepage_tour.mp4", 0.0, 9.0, "gameverse"),
    ("cover-csi", CSI_REC / "Movie_032.mp4", 15.0, 9.0, "csi-game"),
]

# Full films with sound, behind "Watch the film". The promo is also the showreel.
FILMS = [
    ("originforge-promo", PROMO, "product-films", 7.0),
    ("medigate-film", MEDIGATE, "medigate", 15.0),
    ("alquilar-film", ALQ_HOST, "alquilar", 9.0),
    ("csi-film", CSI_REC / "Movie_032.mp4", "csi-game", 20.0),
]
REEL = "originforge-promo"

# Gallery clips: (slug, name, source, start s | None, duration s | None, caption en, caption fr).
# GameVerse sources are zip members (screen recordings, kept whole).
CLIPS = [
    ("gameverse", "homepage-tour", "01_homepage_tour.mp4", None, None, "Homepage tour", "Visite de l'accueil"),
    ("gameverse", "catalog-search-and-details", "02_catalog_search_and_details.mp4", None, None, "Search the catalogue, open a game", "Recherche dans le catalogue, fiche d'un jeu"),
    ("gameverse", "login-and-profile", "03_login_and_profile.mp4", None, None, "Sign-in and profile", "Connexion et profil"),
    ("gameverse", "cart-and-checkout", "04_cart_and_checkout.mp4", None, None, "Cart and checkout", "Panier et paiement"),
    ("gameverse", "contact-seller-and-inbox", "05_contact_seller_and_inbox.mp4", None, None, "Contact the seller, then the inbox", "Contacter le vendeur, puis la messagerie"),
    ("gameverse", "seller-listing", "06_seller_listing.mp4", None, None, "A seller lists a new game", "Un vendeur met un jeu en vente"),
    ("csi-game", "pillars", CSI_REC / "Movie_005.mp4", 0.0, 10.0, "Level 1: platforming between the pillars", "Niveau 1 : des sauts entre les piliers"),
    ("csi-game", "demon", CSI_REC / "Movie_010.mp4", 2.0, 10.0, "The demon at the end of level 1", "Le démon à la fin du niveau 1"),
    ("csi-game", "forest-traps", CSI_REC / "Movie_028.mp4", 0.0, 6.0, "Spike heads and traps in the forest", "Têtes à pointes et pièges dans la forêt"),
    ("csi-game", "fire-demon", CSI_REC / "Movie_030.mp4", 0.0, 10.0, "The fire demon", "Le démon de feu"),
    # 26-38 s: the cover already shows 15-24 s of this recording.
    ("csi-game", "jungle", CSI_REC / "Movie_032.mp4", 26.0, 12.0, "The jungle: crates and the beast", "La jungle : des caisses et la bête"),
    # Galaxy cuts come from these same episodes; the seed keeps one page from repeating seconds.
    ("alquilar", "find-a-stay", ALQ_FIND, 33.0, 6.0, "Filters: the right home, just right", "Les filtres : le bon logement"),
    ("alquilar", "listing-page", ALQ_LISTING, 9.0, 24.0, "The listing page: highlights, reviews, the host", "La fiche : points forts, avis, l'hôte"),
    ("alquilar", "host-calendar", ALQ_CAL, 12.0, 15.0, "The host calendar: open, booked, nights off", "Le calendrier de l'hôte : libre, réservé, fermé"),
    ("alquilar", "booking", ALQ_BOOK, 6.0, 12.0, "Booking: dates and guests", "Réserver : dates et voyageurs"),
]

# Projects whose feature photos also fly in the hero galaxy.
GALAXY_PHOTO_SLUGS = ("alquilar", "medigate")

# Stills pulled from video frames: (slug, video, time s, caption en, caption fr).
# Only scenes no clip or cover shows: a frame of a clip on the same page reads as a repeat.
FRAMES = [
    ("csi-game", CSI_REC / "Movie_001.mp4", 4.0, "Level 1: the first jumps", "Niveau 1 : les premiers sauts"),
    ("csi-game", CSI_REC / "Movie_014.mp4", 4.0, "The purple forest", "La forêt violette"),
]

# Feature photos: (slug, source, caption en, caption fr)
STILLS = [
    ("medigate", MG_SHOTS / "01-entrance/desktop-01-landing.png", "Landing page", "Page d'accueil"),
    ("medigate", MG_SHOTS / "02-home-and-courses/desktop-01-dashboard.png", "Student dashboard", "Tableau de bord étudiant"),
    ("medigate", MG_SHOTS / "02-home-and-courses/desktop-03-courses-catalogue.png", "Course catalogue", "Catalogue des cours"),
    ("medigate", MG_SHOTS / "02-home-and-courses/desktop-10-flash-sheet-reader.png", "Flash-sheet reader", "Lecteur de fiches flash"),
    ("medigate", MG_SHOTS / "03-create-a-session/desktop-01-pick-modules.png", "Building a revision session", "Créer une session de révision"),
    ("medigate", MG_SHOTS / "05-written-answers-and-clinical-cases/desktop-01-clinical-case-question.png", "Clinical cases", "Cas cliniques"),
    ("medigate", MG_SHOTS / "07-flashcards/desktop-04-card-back-and-grade.png", "Flashcards with spaced repetition", "Flashcards à répétition espacée"),
    ("medigate", MG_SHOTS / "06-results/desktop-01-score.png", "Results, question by question", "Résultats, question par question"),
    ("medigate", MG_SHOTS / "10-progression-and-motivation/desktop-02-trophies.png", "Levels, seasons and trophies", "Niveaux, saisons et trophées"),
    ("medigate", MG_SHOTS / "09-payments-and-credits/desktop-05-checkout.png", "Credits checkout", "Paiement des crédits"),
    ("alquilar", ALQ_APP / "guest/01_find_stay/screenshots/guest_find_01_home_en.png", "App: home and categories", "App : accueil et catégories"),
    ("alquilar", ALQ_APP / "guest/01_find_stay/screenshots/guest_find_08_results_map_en.png", "App: results on the map", "App : résultats sur la carte"),
    ("alquilar", ALQ_APP / "guest/03_booking/screenshots/guest_booking_05_review_and_price_en.png", "App: the full price, before paying", "App : le prix complet, avant de payer"),
    ("alquilar", ALQ_APP / "guest/03_booking/screenshots/guest_booking_06_payment_method_en.png", "App: Edahabia, CIB or cash", "App : Edahabia, CIB ou espèces"),
    ("alquilar", ALQ_APP / "host/03_dashboard/screenshots/host_dashboard_04_earnings_overview_en.png", "App: host earnings", "App : revenus de l'hôte"),
    ("alquilar", ALQ_APP / "host/03_dashboard/screenshots/host_dashboard_06_performance_stats_en.png", "App: host performance", "App : performances de l'hôte"),
    ("alquilar", ALQ_PHOTOS / "feature_1_search.png", "Search every wilaya", "Rechercher dans chaque wilaya"),
    ("alquilar", ALQ_PHOTOS / "feature_2_map.png", "Every home on the map", "Chaque logement sur la carte"),
    ("alquilar", ALQ_PHOTOS / "feature_3_price.png", "The full price before booking", "Le prix complet avant de réserver"),
    ("alquilar", ALQ_PHOTOS / "feature_4_trips.png", "Trips across Algeria", "Des séjours dans toute l'Algérie"),
    ("alquilar", ALQ_WEB / "Screenshot 2026-09-11 234252.png", "Checkout: BaridiMob, CIB or cash", "Paiement : BaridiMob, CIB ou espèces"),
    ("alquilar", ALQ_WEB / "Screenshot 2026-09-11 234329.png", "Map search across Algeria", "Recherche sur la carte de l'Algérie"),
    ("alquilar", ALQ_WEB / "Screenshot 2026-09-11 234225.png", "Listing page with the booking box", "Fiche logement et réservation"),
    ("gameverse", PICS / "Screenshot 2025-05-26 151758.png", "Homepage and publisher sale", "Accueil et promotion éditeur"),
    ("gameverse", PICS / "Screenshot 2025-05-23 010408.png", "Featured games carousel", "Carrousel des jeux à la une"),
    ("gameverse", PICS / "Screenshot 2025-05-26 152452.png", "Newest games", "Les derniers jeux"),
    ("gameverse", PICS / "Screenshot 2025-05-21 204051.png", "Cart with the invoice summary", "Panier et récapitulatif"),
    ("gameverse", PICS / "Screenshot 2025-05-23 003225.png", "Invoice: subtotal, 5 % fee, total", "Facture : sous-total, frais de 5 %, total"),
]

# Encoder settings, tuned on real clips (Oct 2026): each AV1 CRF was raised until
# its SSIM matched the H.264 file's (galaxy 0.968, covers 0.991), so the AV1
# saving (-35 % galaxy, -49 % covers) costs no visible quality.
LOOP = {"fps": 24, "crf264": 30, "max264": "450k", "crfav1": 50}        # galaxy cards
COVER = {"fps": 24, "crf264": 28, "max264": "900k", "crfav1": 48}       # work-grid loops
CLIP = {"fps": 25, "crf264": 28, "max264": "1200k", "crfav1": 42, "screen": True}  # screen recordings
GAMEPLAY = {"fps": 30, "crf264": 27, "max264": "1500k", "crfav1": 44}  # game footage (pixel art in motion)
FILM = {"fps": None, "crf264": 25, "max264": "2500k", "crfav1": 38}     # full films with sound


def ffmpeg(*args: str):
    cmd = ["ffmpeg", "-v", "error", "-y", *args]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"ffmpeg failed: {' '.join(cmd)}\n{result.stderr}")


def probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
         "-show_entries", "format=duration", "-of", "json", str(path)], capture_output=True, text=True, check=True,
    ).stdout
    data = json.loads(out)
    stream = data["streams"][0]
    return {"width": int(stream["width"]), "height": int(stream["height"]),
            "duration": round(float(data.get("format", {}).get("duration", 0) or 0))}


def rel(path: Path) -> str:
    return path.relative_to(REPO / "backend" / "media").as_posix()


def encode(src: Path, base: Path, vf: str, preset: dict, force: bool, trim=(), audio=False, poster_at=0.5) -> dict:
    """<base>-web.mp4 (H.264) + <base>-av1.mp4 (AV1) + <base>-web.jpg poster."""
    h264, av1, poster = (base.with_name(base.name + s) for s in ("-web.mp4", "-av1.mp4", "-web.jpg"))
    fps = preset["fps"]
    gop = str((fps or 30) * 2)
    filters = vf + (f",fps={fps}" if fps else "") + ",format=yuv420p"
    sound = ["-c:a", "aac", "-b:a", "96k", "-ac", "2"] if audio else ["-an"]
    if force or not h264.exists():
        ffmpeg(*trim, "-i", str(src), "-vf", filters, "-c:v", "libx264", "-preset", "slow", "-crf", str(preset["crf264"]),
               "-profile:v", "high", "-maxrate", preset["max264"], "-bufsize", f"{int(preset['max264'][:-1]) * 2}k",
               "-g", gop, *sound, "-movflags", "+faststart", str(h264))
    if force or not av1.exists():
        tune = ["-aom-params", "tune-content=screen"] if preset.get("screen") else []
        ffmpeg(*trim, "-i", str(src), "-vf", filters, "-c:v", "libaom-av1", "-crf", str(preset["crfav1"]), "-b:v", "0",
               "-cpu-used", "6", "-row-mt", "1", "-tiles", "2x2", "-g", gop, *tune, *sound, "-movflags", "+faststart", str(av1))
    if force or not poster.exists():
        ffmpeg("-ss", str(poster_at), "-i", str(h264), "-frames:v", "1", "-q:v", "4", str(poster))
    info = probe(h264)
    # AV1 is only published when it is clearly smaller (static screen
    # recordings are already cheap in H.264; there it can come out bigger).
    keep = av1.stat().st_size <= h264.stat().st_size * 0.9
    print(f"  {base.name}: h264 {h264.stat().st_size // 1024} KB, av1 {av1.stat().st_size // 1024} KB"
          f"{'' if keep else ' (not smaller: H.264 only)'}, {info['width']}x{info['height']}")
    return {"file": rel(h264), "file_av1": rel(av1) if keep else "", "poster": rel(poster), **info}


def scale_for(src: Path, vertical_h: int, landscape_h: int) -> str:
    info = probe(src)
    return f"scale=-2:{vertical_h if info['height'] > info['width'] else landscape_h}:flags=lanczos"


def build(only: str | None, force: bool) -> dict:
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            sys.exit(f"{tool} is not on PATH.")
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    tmp = Path(tempfile.mkdtemp(prefix="of-media-"))
    gv = {}
    if GV_ZIP.exists():
        with zipfile.ZipFile(GV_ZIP) as z:
            for member in z.namelist():
                if member.endswith(".mp4") and "/" not in member.strip("/"):
                    gv[member] = Path(z.extract(member, tmp))

    def source(src):
        return gv.get(src) if isinstance(src, str) else src

    def wanted(name):
        return only in (None, name)

    if wanted("galaxy"):
        (OUT / "galaxy").mkdir(parents=True, exist_ok=True)
        manifest["galaxy"] = []
        print("galaxy")
        for name, src, start, dur, slug in GALAXY:
            path = source(src)
            if not path:
                continue
            # Vertical sources become 640px-tall cards, landscape ones 360px (ArtCraft's size).
            item = encode(path, OUT / "galaxy" / name, scale_for(path, 640, 360), LOOP, force,
                          trim=("-ss", str(start), "-t", str(dur)))
            manifest["galaxy"].append({"name": name, "slug": slug, **item, **span(src, start, dur)})

    if wanted("covers"):
        (OUT / "loops").mkdir(parents=True, exist_ok=True)
        manifest["covers"] = []
        print("covers")
        for name, src, start, dur, slug in COVERS:
            path = source(src)
            if not path:
                continue
            item = encode(path, OUT / "loops" / name, scale_for(path, 960, 720), COVER, force,
                          trim=("-ss", str(start), "-t", str(dur)))
            manifest["covers"].append({"name": name, "slug": slug, **item, **span(src, start, dur)})

    if wanted("films"):
        (OUT / "films").mkdir(parents=True, exist_ok=True)
        manifest["films"] = []
        print("films")
        for name, src, slug, poster_at in FILMS:
            item = encode(src, OUT / "films" / name, scale_for(src, 1280, 720), FILM, force, audio=True, poster_at=poster_at)
            manifest["films"].append({"name": name, "slug": slug, **item})
            if name == REEL:
                manifest["reel"] = item

    if wanted("clips"):
        (OUT / "clips").mkdir(parents=True, exist_ok=True)
        manifest["clips"] = []
        print("clips")
        for slug, name, src, start, dur, cap_en, cap_fr in CLIPS:
            path = source(src)
            if not path or not path.exists():
                continue
            # Zip members are screen recordings; the Alquilar series is app UI in motion.
            screen = isinstance(src, str) or slug == "alquilar"
            trim = ("-ss", str(start), "-t", str(dur)) if start is not None else ()
            # 1280 on the long side, never upscaled (portrait sources stay portrait-sized).
            info = probe(path)
            size = "scale=-2:'min(1280,ih)'" if info["height"] > info["width"] else "scale='min(1280,iw)':-2"
            item = encode(path, OUT / "clips" / f"{slug}-{name}", f"{size}:flags=lanczos",
                          CLIP if screen else GAMEPLAY, force, trim=trim, poster_at=1.5)
            manifest["clips"].append({"slug": slug, "caption_en": cap_en, "caption_fr": cap_fr, **item, **span(src, start, dur)})

    if wanted("stills"):
        (OUT / "stills").mkdir(parents=True, exist_ok=True)
        manifest["stills"] = []
        print("stills")
        counts: dict[str, int] = {}
        for slug, src, cap_en, cap_fr in STILLS:
            if not src.exists():
                print(f"  missing {src}")
                continue
            counts[slug] = counts.get(slug, 0) + 1
            dest = OUT / "stills" / f"{slug}-{counts[slug]:02d}-web.jpg"
            if force or not dest.exists():
                # Never upscale; next/image serves AVIF/WebP sizes from this master.
                ffmpeg("-i", str(src), "-vf", "scale='min(1920,iw)':-2:flags=lanczos", "-q:v", "3", str(dest))
            info = probe(dest)
            manifest["stills"].append({"slug": slug, "file": rel(dest), "caption_en": cap_en, "caption_fr": cap_fr,
                                       "width": info["width"], "height": info["height"]})
            print(f"  {dest.name} {info['width']}x{info['height']}")
        for slug, video, at, cap_en, cap_fr in FRAMES:
            if not video.exists():
                print(f"  missing {video}")
                continue
            counts[slug] = counts.get(slug, 0) + 1
            dest = OUT / "stills" / f"{slug}-{counts[slug]:02d}-web.jpg"
            if force or not dest.exists():
                ffmpeg("-ss", str(at), "-i", str(video), "-frames:v", "1", "-vf", "scale='min(1920,iw)':-2:flags=lanczos",
                       "-q:v", "3", str(dest))
            info = probe(dest)
            manifest["stills"].append({"slug": slug, "file": rel(dest), "caption_en": cap_en, "caption_fr": cap_fr,
                                       "width": info["width"], "height": info["height"], **span(video, at, 0)})
            print(f"  {dest.name} {info['width']}x{info['height']}")

    if wanted("logos"):
        manifest["logos"] = build_logos(force)

    if wanted("galaxy") or wanted("stills"):
        # Feature photos of these projects also fly in the galaxy: 640px copies
        # (the gallery masters are 1920px), never decoded, so they cost little.
        (OUT / "galaxy").mkdir(parents=True, exist_ok=True)
        manifest["galaxy_photos"] = []
        print("galaxy photos")
        counts: dict[str, int] = {}
        for still in manifest.get("stills", []):
            if still["slug"] not in GALAXY_PHOTO_SLUGS:
                continue
            counts[still["slug"]] = counts.get(still["slug"], 0) + 1
            # "-web" marks it processed, so the admin's upload pipeline leaves it alone.
            dest = OUT / "galaxy" / f"{still['slug']}-photo-{counts[still['slug']]:02d}-web.jpg"
            if force or not dest.exists():
                portrait = still["height"] > still["width"]
                ffmpeg("-i", str(OUT.parent / still["file"]), "-vf",
                       ("scale=-2:640" if portrait else "scale=640:-2") + ":flags=lanczos", "-q:v", "4", str(dest))
            info = probe(dest)
            manifest["galaxy_photos"].append({"slug": still["slug"], "file": rel(dest),
                                              "width": info["width"], "height": info["height"]})
            print(f"  {dest.name} {info['width']}x{info['height']} {dest.stat().st_size // 1024} KB")

    shutil.rmtree(tmp, ignore_errors=True)
    manifest_path.write_text(json.dumps(manifest, indent=2))
    return manifest


def build_logos(force: bool) -> list[dict]:
    """Brand marks that read on the site's near-black background."""
    from PIL import Image

    dest = OUT / "logos"
    dest.mkdir(parents=True, exist_ok=True)
    out = []
    print("logos")
    # MediGate: the lockup's navy wordmark would vanish on black; it becomes ink.
    lockup = (MG_BRAND / "medigate-lockup.svg").read_text(encoding="utf-8").replace("#123641", "#ECECEE")
    (dest / "medigate-logo.svg").write_text(lockup, encoding="utf-8")
    shutil.copyfile(MG_BRAND / "medigate-mark.svg", dest / "medigate-mark.svg")
    out.append({"slug": "medigate", "logo": rel(dest / "medigate-logo.svg"), "mark": rel(dest / "medigate-mark.svg")})
    # Alquilar: the coral mark as is; the black wordmark turned white, with alpha.
    mark = Image.open(ALQ_DIR / "Myassets/logo-trans.png").convert("RGBA")
    mark.thumbnail((256, 256))
    mark.save(dest / "alquilar-mark.png", optimize=True)
    gray = Image.open(ALQ_DIR / "tmp/pdfs/Alquilar-logo-vector.png").convert("L")
    gray = gray.resize((gray.width // 2, gray.height // 2), Image.LANCZOS)
    white = Image.new("RGBA", gray.size, (236, 236, 238, 0))
    white.putalpha(gray.point(lambda v: 255 - v))
    white.save(dest / "alquilar-logo.png", optimize=True)
    out.append({"slug": "alquilar", "logo": rel(dest / "alquilar-logo.png"), "mark": rel(dest / "alquilar-mark.png")})
    for item in out:
        print(f"  {item['slug']}: {item['logo']}, {item['mark']}")
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=("galaxy", "covers", "films", "clips", "stills", "logos"))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    build(args.only, args.force)
