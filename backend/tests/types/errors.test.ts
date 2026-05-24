import { describe, expect, it } from 'bun:test';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
  InternalServerError,
  isAppError,
  isNotFoundError,
  isUnauthorizedError,
  isForbiddenError,
  getErrorStatusCode,
  getErrorMessage,
} from '../../src/types/errors';

describe('error types', () => {
  describe('AppError', () => {
    it('should create an error with default status code 500', () => {
      const err = new AppError('Test error');
      expect(err.message).toBe('Test error');
      expect(err.statusCode).toBe(500);
      expect(err.name).toBe('AppError');
    });

    it('should accept custom status code, code, and details', () => {
      const err = new AppError('Custom error', 418, 'TEAPOT', { detail: 'info' });
      expect(err.statusCode).toBe(418);
      expect(err.code).toBe('TEAPOT');
      expect(err.details).toEqual({ detail: 'info' });
    });
  });

  describe('specific error classes', () => {
    it('NotFoundError should have status 404', () => {
      const err = new NotFoundError('Not found');
      expect(err.statusCode).toBe(404);
      expect(err.name).toBe('NotFoundError');
    });

    it('UnauthorizedError should have status 401', () => {
      const err = new UnauthorizedError('Unauthorized');
      expect(err.statusCode).toBe(401);
      expect(err.name).toBe('UnauthorizedError');
    });

    it('ForbiddenError should have status 403', () => {
      const err = new ForbiddenError('Forbidden');
      expect(err.statusCode).toBe(403);
      expect(err.name).toBe('ForbiddenError');
    });

    it('BadRequestError should have status 400', () => {
      const err = new BadRequestError('Bad request');
      expect(err.statusCode).toBe(400);
      expect(err.name).toBe('BadRequestError');
    });

    it('ConflictError should have status 409', () => {
      const err = new ConflictError('Conflict');
      expect(err.statusCode).toBe(409);
      expect(err.name).toBe('ConflictError');
    });

    it('ValidationError should have status 422 and optional field', () => {
      const err = new ValidationError('Validation failed', 'email');
      expect(err.statusCode).toBe(422);
      expect(err.field).toBe('email');
      expect(err.name).toBe('ValidationError');
    });

    it('TooManyRequestsError should have status 429 and optional retryAfter', () => {
      const err = new TooManyRequestsError('Rate limited', 60);
      expect(err.statusCode).toBe(429);
      expect(err.retryAfter).toBe(60);
      expect(err.name).toBe('TooManyRequestsError');
    });

    it('InternalServerError should have status 500', () => {
      const err = new InternalServerError('Server error');
      expect(err.statusCode).toBe(500);
      expect(err.name).toBe('InternalServerError');
    });
  });

  describe('type guards', () => {
    it('isAppError should identify AppError and subclasses', () => {
      expect(isAppError(new AppError('test'))).toBe(true);
      expect(isAppError(new NotFoundError('test'))).toBe(true);
      expect(isAppError(new Error('test'))).toBe(false);
    });

    it('isNotFoundError should only identify NotFoundError', () => {
      expect(isNotFoundError(new NotFoundError('test'))).toBe(true);
      expect(isNotFoundError(new AppError('test', 404))).toBe(false);
    });

    it('isUnauthorizedError should only identify UnauthorizedError', () => {
      expect(isUnauthorizedError(new UnauthorizedError('test'))).toBe(true);
      expect(isUnauthorizedError(new AppError('test', 401))).toBe(false);
    });

    it('isForbiddenError should only identify ForbiddenError', () => {
      expect(isForbiddenError(new ForbiddenError('test'))).toBe(true);
      expect(isForbiddenError(new AppError('test', 403))).toBe(false);
    });
  });

  describe('utility functions', () => {
    it('getErrorStatusCode should return status from AppError', () => {
      expect(getErrorStatusCode(new BadRequestError('test'))).toBe(400);
    });

    it('getErrorStatusCode should return 500 for non-AppErrors', () => {
      expect(getErrorStatusCode(new Error('test'))).toBe(500);
      expect(getErrorStatusCode('string error')).toBe(500);
    });

    it('getErrorMessage should extract message from Error', () => {
      expect(getErrorMessage(new Error('test message'))).toBe('test message');
    });

    it('getErrorMessage should return string as-is', () => {
      expect(getErrorMessage('string error')).toBe('string error');
    });

    it('getErrorMessage should return default for unknown types', () => {
      expect(getErrorMessage({ some: 'object' })).toBe('An unknown error occurred');
    });
  });
});
