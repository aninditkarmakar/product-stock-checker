import axios from 'axios';
import { ILogger } from './Logger';
import { PageConfig } from './utils';

export interface INotifier {
	notifySuccess(vendor: string, product: string, url: string): Promise<void>;
	notifyError(count: number): Promise<void>;
}

export class NotifierError extends Error {
	innerError: Error | undefined;

	constructor(message: string, error?: Error) {
		message += ` Inner Error Message: ${error ? error.message : 'undefined'}`;
		super(message);
		this.name = 'NotifierError';
		this.innerError = error;
	}
}

export class IftttNotifier implements INotifier {
	private webhook: string;

	constructor(webhook: string) {
		this.webhook = webhook;
	}

	async notifySuccess(vendor: string, product: string, url: string) {
		const message = `! Stock change for ${vendor} - ${product} !`;
		try {
			await axios.post(this.webhook, {
				value1: message,
				value2: url,
			});
		} catch (err) {
			throw new NotifierError(`Error POST-ing to webhook.`, err);
		}
	}

	async notifyError(count: number): Promise<void> {
		const msg = `${count} ERRORS!`;
		try {
			await axios.post(this.webhook, {
				value1: msg,
				value2: 'https://www.google.com',
			});
		} catch (err) {
			throw new NotifierError(`Error POST-ing to webhook.`, err);
		}
	}
}
