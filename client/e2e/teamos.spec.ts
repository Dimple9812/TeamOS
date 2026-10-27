import { expect, type Browser, type Locator, type Page, test } from "@playwright/test";

const column = (page: Page, name: string) => page.getByRole("region", { name });

async function startDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).first().click();
  await page.waitForURL(/\/w\/[^/]+\/p\//);
  await expect(page.getByTestId("task-card").first()).toBeVisible();
}

/** Mouse drag with small steps so dnd-kit's activation distance and collision detection kick in. */
async function drag(page: Page, from: Locator, to: Locator, offsetY = 30) {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + offsetY, { steps: 20 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}

async function signUp(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/signup");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(`${name.toLowerCase()}-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/w\//);
  return page;
}

test("demo opens a populated board with the status ribbon", async ({ page }) => {
  await startDemo(page);
  await expect(page.getByRole("heading", { name: "Website relaunch" })).toBeVisible();
  for (const name of ["To do", "In progress", "In review", "Done"]) await expect(column(page, name)).toBeVisible();
  await expect(page.getByRole("img", { name: /^Progress: 5 to do, 3 in progress, 2 in review, 3 done$/ })).toBeVisible();
});

test("dragging a card to another column saves it", async ({ page }) => {
  await startDemo(page);
  const card = column(page, "To do").getByTestId("task-card").filter({ hasText: "Cookie banner" });
  await drag(page, card, column(page, "In review"));
  await expect(column(page, "In review").getByText("Cookie banner and privacy page")).toBeVisible();
  await page.reload();
  await expect(column(page, "In review").getByText("Cookie banner and privacy page")).toBeVisible();
  await expect(column(page, "To do").getByText("Cookie banner and privacy page")).toHaveCount(0);
});

test("cards can be moved with the keyboard", async ({ page }) => {
  await startDemo(page);
  const card = column(page, "To do").getByTestId("task-card").filter({ hasText: "Launch announcement email" });
  await card.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);
  await page.keyboard.press("Space");
  await expect(column(page, "In progress").getByText("Launch announcement email")).toBeVisible();
  // Enter opens the card.
  await column(page, "In progress").getByTestId("task-card").filter({ hasText: "Launch announcement email" }).press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Comments");
});

test("two teammates see each other's changes live", async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await startDemo(owner);
  const projectUrl = owner.url();
  const workspaceId = projectUrl.match(/\/w\/([^/]+)/)![1];
  const ws = await (await owner.request.get(`/api/workspaces/${workspaceId}`)).json();

  const mate = await signUp(browser, "Mira");
  await mate.goto(`/join/${ws.workspace.inviteCode}`);
  await mate.getByRole("button", { name: "Join workspace" }).click();
  await mate.waitForURL(new RegExp(`/w/${workspaceId}$`));
  await mate.goto(new URL(projectUrl).pathname);
  await expect(mate.getByTestId("task-card").first()).toBeVisible();

  // The owner sees Mira's avatar on the project they're both viewing.
  await expect(owner.getByLabel(/Viewing now: .*Mira/)).toBeVisible();

  // A task added by the owner appears for Mira without a reload…
  await column(owner, "To do").getByRole("button", { name: "Add task" }).click();
  await owner.getByPlaceholder("Task title, then Enter").fill("Live from the owner");
  await owner.keyboard.press("Enter");
  await expect(column(mate, "To do").getByText("Live from the owner")).toBeVisible();

  // …and Mira's comment shows up in the owner's open card.
  await owner.getByText("Live from the owner").click();
  await mate.getByText("Live from the owner").click();
  await mate.getByLabel("Write a comment").fill("I'll take this one");
  await mate.getByRole("button", { name: "Comment" }).click();
  await expect(owner.getByRole("dialog").getByText("I'll take this one")).toBeVisible();
});

test("AI breakdown suggests tasks and adds the chosen ones", async ({ page }) => {
  await startDemo(page);
  const before = await column(page, "To do").getByTestId("task-card").count();
  await page.getByRole("button", { name: "Break down a goal" }).click();
  await page.getByPlaceholder(/Launch the new pricing/).fill("Fix the slow checkout on mobile");
  await page.getByRole("button", { name: "Suggest tasks" }).click();
  await expect(page.getByText("Built-in planner")).toBeVisible();
  await page.getByRole("checkbox", { name: /Write a short postmortem/ }).uncheck();
  await page.getByRole("button", { name: "Add 5 tasks" }).click();
  await expect(column(page, "To do").getByTestId("task-card")).toHaveCount(before + 5);
  await expect(page.getByText("Added 5 tasks to To do.")).toBeVisible();
});

test("dragging a task on the calendar changes its due date", async ({ page }) => {
  await startDemo(page);
  await page.getByRole("tab", { name: "Calendar" }).click();
  const chip = page.getByTestId("calendar-chip").filter({ hasText: "Load test" });
  await expect(chip).toBeVisible();
  // Unschedule it by dropping on the "No due date" panel.
  await drag(page, chip, page.getByRole("complementary", { name: "No due date" }), 60);
  await expect(page.getByRole("complementary", { name: "No due date" }).getByText("Load test the launch traffic")).toBeVisible();
  await page.getByRole("tab", { name: "List" }).click();
  await expect(page.getByRole("row", { name: /Load test the launch traffic/ })).toContainText("—");
});

test("viewers can look but not change anything", async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await startDemo(owner);
  const projectPath = new URL(owner.url()).pathname;
  const workspaceId = projectPath.split("/")[2];
  const ws = await (await owner.request.get(`/api/workspaces/${workspaceId}`)).json();

  const viewer = await signUp(browser, "Vik");
  await viewer.goto(`/join/${ws.workspace.inviteCode}`);
  await viewer.getByRole("button", { name: "Join workspace" }).click();
  await viewer.waitForURL(new RegExp(`/w/${workspaceId}$`));
  const me = await (await viewer.request.get("/api/auth/me")).json();
  await owner.request.patch(`/api/workspaces/${workspaceId}/members/${me.user.id}`, { data: { role: "viewer" } });

  await viewer.goto(projectPath);
  await expect(viewer.getByText("You're a viewer in this workspace")).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Add task" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Break down a goal" })).toHaveCount(0);
  await viewer.getByText("Build pricing page").click();
  await expect(viewer.getByLabel("Status")).toBeDisabled();
  // And the server refuses even if the UI were bypassed.
  const tasks = await (await viewer.request.get(`/api/projects/${projectPath.split("/")[4]}/tasks`)).json();
  const res = await viewer.request.post(`/api/tasks/${tasks.tasks[0].id}/move`, { data: { status: "done" } });
  expect(res.status()).toBe(403);
});

test("works on a phone-sized screen", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  await startDemo(page);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Mobile app v2" }).click();
  await expect(page.getByRole("heading", { name: "Mobile app v2" })).toBeVisible();
  await page.getByRole("tab", { name: "List" }).click();
  await expect(page.getByRole("button", { name: "Crash on Android 12 when rotating" })).toBeVisible();
});
