// Share the frontend's locked DOM test dependency; no private build cache is required.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
export const {Window}=await import(pathToFileURL(require.resolve('happy-dom')).href);
