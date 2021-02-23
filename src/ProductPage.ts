import * as pw from 'playwright';
import { ILogger } from './Logger';
import { IftttNotifier, INotifier } from './Notifier';
import { PageConfig } from './utils';

export interface ProductPageOptions {
	id: number;
	logger: ILogger;
	pageConfig: PageConfig;
	notifier: INotifier;
}

export class ProductPageError extends Error {
	innerError: Error | undefined;

	constructor(message: string, error?: Error) {
		message += ` Inner Error Message: ${error ? error.message : 'undefined'}`;
		super(message);
		this.name = 'ProductPageError';
		this.innerError = error;
	}
}

export class ProductPage {
	private _id: number;
	private _logger: ILogger;
	private _config: PageConfig;
	private _page: pw.Page;
	private _notifer: INotifier;

	constructor(page: pw.Page, options: ProductPageOptions) {
		this._id = options.id;
		this._logger = options.logger;
		this._config = options.pageConfig;
		this._page = page;

		this._notifer = options.notifier;
	}

	async navigate() {
		try {
			await this._page.goto(this._config.url);
			this._logger.info(`[${this._id}] Loaded website.`);
		} catch (err: any) {
			throw new ProductPageError(`Error navigating to website.`, err);
		}
	}

	async checkStock(): Promise<boolean> {
		let domChanged = false;
		let selector: pw.ElementHandle<SVGElement | HTMLElement> | undefined;
		try {
			try {
				selector = await this._page.waitForSelector(`xpath=/${this._config.xpath}`);
			} catch (err) {
				if ((err.message as string).indexOf('Timeout') !== -1 && (err.message as string).indexOf('exceeded') !== -1) {
					this._logger.warn(`[${this._id}] DOM Changed.`);
					domChanged = true;
				} else {
					throw err;
				}
			}

			if (domChanged && selector === undefined) {
				this._logger.info(`[${this._id}] Notification sent due to DOM change.`);
				return true;
			} else if (selector) {
				const innerText = await selector.textContent();
				this._logger.info(`[${this._id}] Inner text : ${innerText}`);
				if (!innerText || innerText.toLowerCase() !== this._config.unavailableIndicator.toLowerCase()) {
					await this._notifer.notifySuccess(this._config.vendor, this._config.product, this._config.url);
					this._logger.info(`[${this._id}] Notification sent.`);
					return true;
				}
			} else {
				throw new ProductPageError(`Unknown Error.`);
			}
		} catch (err) {
			throw new ProductPageError(`Error checking for stock.`, err);
		}

		return false;
	}
}
