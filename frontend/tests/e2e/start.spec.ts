import { expect, test, type Page } from "@playwright/test";

// A brand-new client, every run: the e-mail is unique, the password random.
const stamp = Date.now();
const email = `e2e-${stamp}@originforge.test`;
const password = `e2e-${Math.random().toString(36).slice(2)}-Forge!`;

test.beforeEach(async ({ context }) => {
  // Dev-only overlays (react-scan / react-grab) stay out of the way of the test.
  await context.addInitScript(() => localStorage.setItem("of:no-devtools", "1"));
});

const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true }).click();
// The calculator readout (an aria-live paragraph): "216 000–281 000 DZD".
const estimate = (page: Page) => page.locator('p[aria-live="polite"]').filter({ hasText: /\d.*–.*DZD/ }).first();

test("a visitor signs in, prices a project, sends it and follows it", async ({ page }) => {
  await page.goto("/en/start?service=web-platforms");

  // Sign in first: the draft then lives on the account.
  await expect(page.getByRole("heading", { name: /Sign in to start/ })).toBeVisible();
  await page.getByLabel("Full name", { exact: true }).fill("E2E Client");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  // 1 · Service, preselected from ?service=
  await expect(page.getByRole("radio", { name: /Web platforms/ })).toBeChecked();
  await next(page);

  // 2 · Project: required fields are enforced before moving on
  await next(page);
  await expect(page.getByText("This field is required.").first()).toBeVisible();
  await page.getByLabel("Project name", { exact: true }).fill("Booking site for my guesthouse");
  await page.getByLabel("What must it achieve?", { exact: true }).fill("Guests book rooms online and pay a deposit.");
  await page.getByText("Booking / reservations").click();
  await expect(page.getByText("Saved to your account")).toBeVisible();

  // The draft survives a reload, on any device: it is on the server.
  await page.reload();
  await expect(page.getByText("Draft restored")).toBeVisible();
  await page.getByRole("button", { name: /Project/ }).first().click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue("Booking site for my guesthouse");
  await next(page);

  // 3 · Estimate: the price follows the options, live.
  await expect(estimate(page)).toBeVisible();
  const before = await estimate(page).textContent();
  await page.getByText("Rush, about 50 % sooner").click();
  await expect(estimate(page)).not.toHaveText(before!);
  await page.getByLabel(/Your budget \(optional\) · From/).fill("150000");
  await page.getByLabel(/To · DZD/).fill("300000");
  await next(page);

  // 4 · References: files go straight into the draft
  await page.getByLabel("Reference links (optional)", { exact: true }).fill("https://medigate-dz.com");
  await page.locator('input[type="file"]').setInputFiles({
    name: "brief.txt", mimeType: "text/plain", buffer: Buffer.from("Rooms, prices, deposit by CIB and Edahabia."),
  });
  await expect(page.getByRole("link", { name: "brief.txt" })).toBeVisible();
  await next(page);

  // 5 · Review and send
  await expect(page.getByText("Booking site for my guesthouse")).toBeVisible();
  await expect(page.getByText("150000 – 300000 DZD")).toBeVisible();
  await page.getByRole("button", { name: "Send my request" }).click();

  await expect(page.getByRole("heading", { name: /Request received/ })).toBeVisible();
  const reference = (await page.getByText(/Your reference is OF-/).textContent())!.match(/OF-[A-Z0-9]{6}/)![0];

  // The client space shows the request, its stage, the file and the conversation.
  await page.getByRole("link", { name: "Open my client space" }).click();
  await expect(page.getByRole("heading", { name: "Booking site for my guesthouse" })).toBeVisible();
  await expect(page.getByText(reference).first()).toBeVisible();
  await expect(page.getByText("Submitted").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /brief\.txt/ })).toBeVisible();
  await page.getByLabel("Write a message").fill("Hello, the rooms photos are coming tomorrow.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Hello, the rooms photos are coming tomorrow.")).toBeVisible();

  // A client is sent back from the studio.
  await page.goto("/en/studio");
  await expect(page).toHaveURL(/\/en\/portal$/);
});
