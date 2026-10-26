import { handleToken } from '../../server/mal.js';

export function POST(request) {
  return handleToken(request, process.env);
}
