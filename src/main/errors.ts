/** An error whose message is written for the person using the app and can be shown as is. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}
