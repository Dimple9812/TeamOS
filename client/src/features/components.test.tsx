import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, useLocation } from "react-router-dom";
import { makeStore } from "../app/store";
import { addDays, today } from "../lib/dates";
import type { Activity, ProjectSummary, Task } from "../lib/types";
import { describe as describeActivity } from "./activity/ActivityFeed";
import { summaryAsText } from "./ai/SummaryModal";
import { StatusRibbon } from "./board/StatusRibbon";
import { CardBody } from "./board/TaskCard";
import { FilterBar } from "./tasks/FilterBar";

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1", status: "todo", order: 1, version: 1, workspaceId: "w", projectId: "p", title: "Ship pricing page", description: "",
  priority: "urgent", assigneeId: "u1", dueDate: addDays(today(), -2), labels: ["web", "launch"], createdBy: "u", completedAt: null,
  createdAt: "", updatedAt: "", ...over,
});

describe("task card", () => {
  it("shows title, labels, urgency, lateness and the assignee", () => {
    render(<CardBody task={task()} assignee="Priya Sharma" />);
    expect(screen.getByText("Ship pricing page")).toBeInTheDocument();
    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.getByText("Urgent")).toBeInTheDocument();
    expect(screen.getByText("2 days late")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Priya Sharma" })).toHaveTextContent("PS");
  });

  it("doesn't call finished work late", () => {
    render(<CardBody task={task({ status: "done", priority: "low" })} assignee={null} />);
    expect(screen.queryByText("2 days late")).toBeNull();
    expect(screen.getByText("2 days ago")).toBeInTheDocument();
  });
});

describe("status ribbon", () => {
  it("describes progress for screen readers", () => {
    render(<StatusRibbon tasks={[task({ status: "done" }), task({ id: "2", status: "todo" }), task({ id: "3", status: "review" }), task({ id: "4", status: "done" })]} />);
    expect(screen.getByText("50% done")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Progress: 1 to do, 0 in progress, 1 in review, 2 done" })).toBeInTheDocument();
  });
});

describe("filter bar", () => {
  it("writes filters into the URL and offers to clear them", async () => {
    const user = userEvent.setup();
    let search = "";
    const { rerender } = render(
      <Provider store={makeStore()}>
        <MemoryRouter initialEntries={["/w/1/p/2"]}>
          <FilterBar members={[{ userId: "u2", name: "Arjun", email: "", role: "member" }]} meId="u1" />
          <Probe onSearch={(s) => (search = s)} />
        </MemoryRouter>
      </Provider>,
    );
    await user.selectOptions(screen.getByLabelText("Priority"), "urgent");
    expect(search).toContain("priority=urgent");
    await user.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(search).toBe("");
    rerender(<></>);
  });
});

function Probe({ onSearch }: { onSearch: (s: string) => void }) {
  onSearch(useLocation().search);
  return null;
}

describe("activity text", () => {
  const a = (type: string, data: Record<string, unknown>): Activity => ({
    id: "a", workspaceId: "w", projectId: "p", taskId: "t", actorId: "u", actorName: "Ada", type, data, createdAt: new Date().toISOString(),
  });
  it("reads like a sentence", () => {
    expect(describeActivity(a("task.moved", { title: "Pricing", to: "review" }))).toBe("moved “Pricing” to In review");
    expect(describeActivity(a("task.assigned", { title: "Pricing", assignee: "Priya" }))).toBe("assigned “Pricing” to Priya");
    expect(describeActivity(a("ai.tasks_created", { count: 4 }))).toBe("added 4 tasks from AI planning");
  });
});

describe("summary copy text", () => {
  it("is plain text a lead can paste into chat", () => {
    const s = { headline: "Half done.", highlights: ["Shipped A."], risks: [], next: ["B is due Friday."] } as unknown as ProjectSummary;
    expect(summaryAsText(s)).toBe("Half done.\n\nHighlights:\n- Shipped A.\n\nNext up:\n- B is due Friday.");
  });
});
