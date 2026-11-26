// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { ChatList } from "@/client/chat-history/ChatList";
afterEach(cleanup);
const chat = { id: "fixture", title: "Original conversation", agent_id: "server", agent_name: "Server",
  created_at: "2026-11-26T00:00:00Z", updated_at: "2026-11-26T00:00:00Z" };
it("renames a chat through an accessible editor without selecting it", async () => {
  let selected = false, title = "";
  render(<ChatList chats={[chat]} onSelect={() => { selected = true; }} onDelete={() => {}}
    onRename={async (_id, value) => { title = value; }} />);
  fireEvent.click(screen.getByRole("button", { name: "Chat actions for Original conversation" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
  fireEvent.change(screen.getByLabelText("Chat name"), { target: { value: "Renamed conversation" } });
  fireEvent.click(screen.getByRole("button", { name: "Save name" }));
  await waitFor(() => expect(title).toBe("Renamed conversation"));
  expect(selected).toBe(false);
});
it("requires confirmation before deleting a conversation", async () => {
  let deleted = false;
  render(<ChatList chats={[chat]} onDelete={async () => { deleted = true; }} />);
  fireEvent.click(screen.getByRole("button", { name: "Chat actions for Original conversation" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
  expect(deleted).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));
  await waitFor(() => expect(deleted).toBe(true));
});
it("keeps the active conversation selectable separately from its actions", () => {
  let selected = "";
  const { container } = render(<ChatList chats={[chat]} compact hideAgentName currentChatId={chat.id}
    onSelect={id => { selected = id; }} onDelete={() => {}} />);
  const conversation = screen.getByRole("button", { current: "page" });
  const actions = screen.getByRole("button", { name: "Chat actions for Original conversation" });
  expect(conversation.parentElement).toBe(actions.parentElement);
  expect(container.querySelector("button button")).toBeNull();
  fireEvent.click(conversation);
  expect(selected).toBe(chat.id);
});
it("opens the rename editor using keyboard menu activation", async () => {
  const user = userEvent.setup();
  render(<ChatList chats={[chat]} onDelete={() => {}} onRename={async () => {}} />);
  screen.getByRole("button", { name: "Chat actions for Original conversation" }).focus();
  await user.keyboard("{ArrowDown}");
  await screen.findByRole("menuitem", { name: "Rename" });
  await user.keyboard("{ArrowDown}{Home}{Enter}");
  expect(await screen.findByRole("dialog", { name: "Rename chat" })).toBeTruthy();
});
