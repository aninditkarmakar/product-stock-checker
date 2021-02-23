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
		try {
			const selector = await this._page.waitForSelector(`xpath=/${this._config.xpath}`);
			const innerText = await selector.textContent();
			this._logger.info(`[${this._id}] Inner text : ${innerText}`);

			if (!innerText || innerText.toLowerCase() !== this._config.unavailableIndicator.toLowerCase()) {
				await this._notifer.notifySuccess(this._config.vendor, this._config.product, this._config.url);
				this._logger.info(`[${this._id}] Notification sent.`);
				return true;
			}
		} catch (err) {
			throw new ProductPageError(`Error checking for stock.`, err);
		}

		return false;
	}
}
