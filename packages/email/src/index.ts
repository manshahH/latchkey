export interface EmailMessage {
  html: string;
  subject: string;
  text: string;
  to: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<{ id: string }>;
}

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const html = (title: string, body: string): string =>
  `<!doctype html><html><body><main style="font-family:system-ui;max-width:560px;margin:auto;padding:24px"><h1>${escapeHtml(title)}</h1><p>${body}</p></main></body></html>`;

export const claimLinkEmail = (input: {
  claimUrl: string;
  productName: string;
  to: string;
}): EmailMessage => ({
  html: html(
    `Get ${input.productName}`,
    `You bought ${escapeHtml(input.productName)}. <a href="${escapeHtml(input.claimUrl)}">Sign in with GitHub to get your code</a>. This link is for the email address used at checkout.`
  ),
  subject: `Get ${input.productName}`,
  text: `You bought ${input.productName}. Sign in with GitHub to get your code: ${input.claimUrl}`,
  to: input.to
});

export const inviteSentEmail = (input: { productName: string; to: string }): EmailMessage => ({
  html: html(
    "Your GitHub invite is ready",
    `Your invite for ${escapeHtml(input.productName)} is ready. Open GitHub notifications to accept it.`
  ),
  subject: "Your GitHub invite is ready",
  text: `Your invite for ${input.productName} is ready. Open GitHub notifications to accept it.`,
  to: input.to
});

export const inviteReminderEmail = (input: { productName: string; to: string }): EmailMessage => ({
  html: html(
    "Your GitHub invite is waiting",
    `Your invite for ${escapeHtml(input.productName)} is still waiting. Open GitHub notifications to accept it.`
  ),
  subject: "Your GitHub invite is waiting",
  text: `Your invite for ${input.productName} is still waiting. Open GitHub notifications to accept it.`,
  to: input.to
});

export const accessRemovedEmail = (input: { productName: string; to: string }): EmailMessage => ({
  html: html(
    "Your access has changed",
    `Your access to ${escapeHtml(input.productName)} is no longer active. If you think this is unexpected, contact the seller.`
  ),
  subject: "Your access has changed",
  text: `Your access to ${input.productName} is no longer active. If you think this is unexpected, contact the seller.`,
  to: input.to
});

export class MemoryEmailSender implements EmailSender {
  public readonly messages: EmailMessage[] = [];

  public send(message: EmailMessage): Promise<{ id: string }> {
    this.messages.push(message);
    return Promise.resolve({ id: String(this.messages.length) });
  }
}

export const emailReady = (): string => "email";
