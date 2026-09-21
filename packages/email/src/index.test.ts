import { expect, test } from "vitest";

import {
  accessRemovedEmail,
  claimLinkEmail,
  emailReady,
  inviteReminderEmail,
  inviteSentEmail
} from "./index.js";

test("email workspace is available", () => {
  expect(emailReady()).toBe("email");
});

test("buyer email templates are plain, actionable, and include text and HTML", () => {
  const messages = [
    claimLinkEmail({
      claimUrl: "https://latchkey.test/claim/token",
      productName: "Starter Kit Pro",
      to: "buyer@example.com"
    }),
    inviteSentEmail({ productName: "Starter Kit Pro", to: "buyer@example.com" }),
    inviteReminderEmail({ productName: "Starter Kit Pro", to: "buyer@example.com" }),
    accessRemovedEmail({ productName: "Starter Kit Pro", to: "buyer@example.com" })
  ];
  for (const message of messages) {
    expect(message.html).toContain("<html>");
    expect(message.text).not.toContain("?");
    expect(message.subject).not.toContain("?");
    expect(message.to).toBe("buyer@example.com");
  }
});
