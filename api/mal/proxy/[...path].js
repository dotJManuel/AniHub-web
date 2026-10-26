import { handleApi } from '../../../server/mal.js';

const handler = (request) => handleApi(request);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
