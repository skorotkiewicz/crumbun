const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"] as const;

import type { Cookies } from "./cookies";

type HttpMethod = (typeof methods)[number];
type PageResult = Response | string | Record<string, unknown> | undefined | null;

export type PageHandler = (context: PageContext) => PageResult | Promise<PageResult>;

export type PageContext = {
  request: Request;
  params: Record<string, string>;
  url: URL;
  render: (view: string, locals?: Record<string, unknown>, init?: ResponseInit) => Promise<Response>;
  json: (value: unknown, init?: ResponseInit) => Response;
  redirect: (path: string, status?: number) => Response;
  cookies: Cookies;
  highlightCode: (source: string, language?: string) => string;
};

export type CrumbunOptions = {
  root?: string;
  port?: number;
  hostname?: string;
  development?: boolean;
  spa?: boolean;
};

export type StaticExportOptions = CrumbunOptions & {
  outDir?: string;
  paths?: string[];
  clean?: boolean;
};

export type StaticExportResult = {
  outDir: string;
};

type PageModule = Partial<Record<HttpMethod, PageHandler>> & {
  default?: PageHandler;
};

type Route = {
  pattern: string;
  module: PageModule;
  dynamicCount: number;
};

export { methods };
export type { HttpMethod, PageResult, PageModule, Route };
