import { promises as fsp } from 'fs';
import * as path from 'path';
import { FileLogger, ILogger } from './Logger';
import { ProductPage } from './ProductPage';
import { IftttNotifier, INotifier } from './Notifier';
import { Config, ErrorItem, PageConfig } from './utils';
import { chromium, firefox } from '../node_modules/playwright/index';
import asyncPool from 'tiny-async-pool';

const startTime = new Date();
const filePaths = {
	config: path.join(__dirname, '../config/config.json'),
	webhook: path.join(__dirname, '../config/webhook.txt'),
	logDir: path.join(__dirname, '../out/logs'),
	errorsFile: path.join(__dirname, '../out/logs/errors.json'),
};
const asyncCount = 3;

const logger: ILogger = FileLogger.getInstance({ dirname: filePaths.logDir });

async function readConfig(pathToConfig: string): Promise<string> {
	const data = await fsp.readFile(pathToConfig, { encoding: 'utf-8' });
	return data;
}

async function readWebHook(pathToWebHook: string): Promise<string> {
	const data = await fsp.readFile(pathToWebHook, { encoding: 'utf-8' });
	return data.trim();
}

async function readErrors(errorFilePath: string): Promise<ErrorItem[]> {
	try {
		const data = await fsp.readFile(errorFilePath, { encoding: 'utf-8' });
		return JSON.parse(data) as ErrorItem[];
	} catch (err) {
		return [];
	}
}

async function writeErrors(errorFilePath: string, errors: ErrorItem[]) {
	await fsp.writeFile(errorFilePath, JSON.stringify(errors), 'utf-8');
}

async function handleErrors(config: Config, results: (0 | Error)[], notifier: INotifier): Promise<void> {
	const errors: ErrorItem[] = [];

	results.forEach((result, idx) => {
		if (result instanceof Error) {
			const item: ErrorItem = {
				config: config.pages[idx],
				error: result.message,
			};
			errors.push(item);
		}
	});

	const previousErrors = await readErrors(filePaths.errorsFile);
	const consolidatedErrors: ErrorItem[] = errors.concat(
		previousErrors.filter((e) => {
			errors.findIndex((i) => i.config.url === e.config.url) < 0;
		}),
	);

	consolidatedErrors.length > 0 ?? (await writeErrors(filePaths.errorsFile, consolidatedErrors));

	if (consolidatedErrors.length > 0 && startTime.getUTCMinutes() % 20 === 0) {
		try {
			await notifier.notifyError(consolidatedErrors.length);
			logger.info(`Notified about errors.`);
		} catch (err) {
			logger.error(`Error when notifying about errors.`);
		}
	}
}

async function doChecks(config: Config, notifier: INotifier) {
	const browser = await chromium.launch({ headless: false });
	logger.info('Browser opened');
	const context = await browser.newContext({
		ignoreHTTPSErrors: false,
		//userAgent: ua,
		// viewport: {
		// 	width: 1024 + Math.floor(Math.random() * 100),
		// 	height: 768 + Math.floor(Math.random() * 100),
		// },
	});

	const iteratorFn = async (pageConfig: PageConfig, idx: number) => {
		const page = await context.newPage();
		await context.clearCookies();
		// await page.route('**/*', (route) => {
		// 	const block = ['tracking', 'collect?', 'bestbuy.com/bf/'];
		// 	if (
		// 		route.request().method().toLowerCase() === 'post' &&
		// 		block.reduce((prev, curr) => {
		// 			return prev || route.request().url().indexOf(curr) !== -1;
		// 		}, false)
		// 	) {
		// 		logger.info(`[${idx}] Aboring request with url: ${route.request().url()}`);
		// 		return route.abort();
		// 	}
		// 	return route.continue();
		// });

		const productPage = new ProductPage(page, { id: idx, logger, pageConfig, notifier });

		try {
			await productPage.navigate();
			await productPage.checkStock();
			await productPage.closePage();
			return 0;
		} catch (err) {
			logger.error(`Error encountered for product at index ${idx}.`);
			logger.error(err);
			await productPage.closePage();
			return new Error(err);
		}
	};

	const results = await asyncPool(asyncCount, config.pages, (pageConfig: PageConfig) => {
		const idx = config.pages.indexOf(pageConfig);
		return iteratorFn(pageConfig, idx);
	});

	await browser.close();

	await handleErrors(config, results, notifier);
}

async function start() {
	const configString = await readConfig(filePaths.config);
	const config = JSON.parse(configString) as Config;
	const webhook = await readWebHook(filePaths.webhook);
	const notifier: INotifier = new IftttNotifier(webhook);

	logger.info('Start...');
	await doChecks(config, notifier);

	return;
}

start().then(() => {
	logger.info('End.');
});
