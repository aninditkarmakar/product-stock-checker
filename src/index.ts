import { promises as fsp } from 'fs';
import * as path from 'path';
import { FileLogger, ILogger } from './Logger';
import { ProductPage } from './ProductPage';
import { IftttNotifier, INotifier } from './Notifier';
import { Config, ErrorItem, PageConfig } from './utils';
import { firefox } from '../node_modules/playwright/index';
import asyncPool from 'tiny-async-pool';

const startTime = new Date();
const filePaths = {
	config: path.join(__dirname, '../config/config.json'),
	webhook: path.join(__dirname, '../config/webhook.txt'),
	logDir: path.join(__dirname, '../out/logs'),
	errorsFile: path.join(__dirname, '../out/logs/errors.json'),
};

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
	const browser = await firefox.launch({ headless: true });
	logger.info('Browser opened');
	const context = await browser.newContext({ ignoreHTTPSErrors: false });

	const iteratorFn = async (pageConfig: PageConfig, idx: number) => {
		try {
			const page = await context.newPage();
			const productPage = new ProductPage(page, { id: idx, logger, pageConfig, notifier });
			await productPage.navigate();
			await productPage.checkStock();
			return 0;
		} catch (err) {
			logger.error(`Error encountered for product at index ${idx}.`);
			logger.error(err);
			return new Error(err);
		}
	};

	const results = await asyncPool(5, config.pages, (pageConfig: PageConfig) => {
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
