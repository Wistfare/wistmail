import type { ErrorHandler } from 'hono'
import { WistMailError } from '@wistmail/shared'

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof WistMailError) {
    return c.json(err.toJSON(), err.statusCode as 400)
  }

  console.error('Unhandled error:', err)

  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
      },
    },
    500,
  )
}
