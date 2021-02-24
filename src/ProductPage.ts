import * as pw from 'playwright';
import { selectors } from 'playwright';
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

	private logInfo(msg: string) {
		this._logger.info(`[${this._id}] ${msg}`);
	}

	private logWarn(msg: string) {
		this._logger.warn(`[${this._id}] ${msg}`);
	}

	private logError(msg: string) {
		this._logger.error(`[${this._id}] ${msg}`);
	}

	private async waitForSelector(selStr: string) {
		let retries = 3;
		let error: any;
		while (retries > 0) {
			try {
				this._logger.info(`[${this._id}] Waiting for selector.`);
				const selector = this._page.waitForSelector(selStr);
				this.logInfo(`Selector loaded.`);
				retries = 0;
				return selector;
			} catch (err) {
				error = err;
				if ((err.message as string).indexOf('Timeout') !== -1 && (err.message as string).indexOf('exceeded') !== -1) {
					retries--;
					this.logInfo(`Refreshing page and waiting for selector. ${retries > 0 ? `${retries} retries left.` : ''}`);
					await this.navigate();
				}
			}
		}

		throw new ProductPageError(`[${this._id}] waitForSelector Timeout`, error);
	}

	async navigate() {
		try {
			await this._page.goto(this._config.url, { waitUntil: 'networkidle' });
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
				const selectorSearches = [this._page.waitForSelector(`xpath=/${this._config.xpath}`), this._page.waitForSelector(this._config.selector)];
				selector = await Promise.race(selectorSearches);
			} catch (err) {
				if (err instanceof ProductPageError && err.message.indexOf('Timeout') !== -1) {
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
				this.logInfo(`Waiting for textContext`);
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

	async closePage(): Promise<void> {
		await this._page.close();
	}
}
