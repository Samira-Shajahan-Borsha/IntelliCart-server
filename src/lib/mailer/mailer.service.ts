import { Global, Inject, Injectable, Module } from "@nestjs/common";
import { ENV, type Env } from "../../config/env";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Outbound email port. The provider (SMTP/SES/...) is plugged in behind this class in a
 * later slice; the baseline keeps messages in memory and can print them in development.
 * Message bodies may contain single-use tokens, so they are never sent to the app logger.
 */
@Injectable()
export class MailerService {
  /** Bounded in-memory outbox used by tests and local development. */
  readonly outbox: MailMessage[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {}

  async send(message: MailMessage): Promise<void> {
    this.outbox.push(message);
    if (this.outbox.length > 100) this.outbox.shift();
    if (this.env.MAIL_TRANSPORT === "console") {
      // Development-only transport (rejected in production by env validation).
      process.stdout.write(
        `\n[dev-mail] to=${message.to} subject="${message.subject}"\n${message.text}\n\n`,
      );
    }
  }
}

@Global()
@Module({ providers: [MailerService], exports: [MailerService] })
export class MailerModule {}
