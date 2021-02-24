export interface PageConfig {
	vendor: string;
	url: string;
	xpath: string;
	selector: string;
	unavailableIndicator: string;
	product: string;
}

export interface Config {
	pages: PageConfig[];
}

export interface ErrorItem {
	config: PageConfig;
	error: string;
}
