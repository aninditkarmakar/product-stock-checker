import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

export interface ILogger {
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
}

export interface FileLoggerProperties {
	dirname: string;
}

export class FileLogger implements ILogger {
	private logger: winston.Logger;
	private static _instance: FileLogger;

	private constructor(props: FileLoggerProperties) {
		const transport = new DailyRotateFile({
			frequency: '24h',
			dirname: props.dirname,
			filename: `%DATE%.log`,
			datePattern: `YYYY-MM-DD`,
			maxFiles: `10d`,
			maxSize: '20m',
			utc: true,
		});

		this.logger = winston.createLogger({
			transports: [new winston.transports.Console(), transport],
			format: winston.format.simple(),
		});
	}

	static getInstance(props?: FileLoggerProperties): FileLogger {
		if (FileLogger._instance) {
			return FileLogger._instance;
		}

		if (!props) {
			throw new Error(`Properties not provided to initialize FileLogger.`);
		}

		FileLogger._instance = new FileLogger(props);
		return FileLogger._instance;
	}

	info(message: string): void {
		this.logger.info(`[${new Date().toISOString()}] ${message}`);
	}

	warn(message: string): void {
		this.logger.warn(`[${new Date().toISOString()}] ${message}`);
	}

	error(message: string): void {
		this.logger.error(`[${new Date().toISOString()}] ${message}`);
	}
}
