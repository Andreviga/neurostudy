import { Request, Response, NextFunction } from 'express';

// Wraps async route handlers so that thrown errors / rejected promises
// are forwarded to Express's error handler instead of crashing the process.
// Required for Express 4 — Express 5 handles this natively.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AsyncFn = (req: any, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncFn) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
