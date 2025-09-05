import { 
  ValidationError, 
  NotFoundError, 
  DatabaseError, 
  ExternalAPIError,
  getErrorStatus,
  getUserFriendlyMessage,
  validateRequiredFields,
  sanitizeInput
} from '../../server/error-handler';

describe('Error Handler', () => {
  describe('Custom Error Classes', () => {
    test('ValidationError should have correct name and message', () => {
      const error = new ValidationError('Invalid input');
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Invalid input');
      expect(error instanceof Error).toBe(true);
    });

    test('ValidationError with field should include field name', () => {
      const error = new ValidationError('Invalid input', 'email');
      expect(error.field).toBe('email');
    });

    test('NotFoundError should have correct format', () => {
      const error = new NotFoundError('Recipe', '123');
      expect(error.name).toBe('NotFoundError');
      expect(error.message).toBe("Recipe with ID '123' not found");
    });

    test('DatabaseError should store original error', () => {
      const originalError = new Error('Connection failed');
      const error = new DatabaseError('Database operation failed', originalError);
      expect(error.name).toBe('DatabaseError');
      expect(error.originalError).toBe(originalError);
    });

    test('ExternalAPIError should include service and status code', () => {
      const error = new ExternalAPIError('Mistral', 'API key invalid', 401);
      expect(error.name).toBe('ExternalAPIError');
      expect(error.message).toBe('Mistral API error: API key invalid');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('getErrorStatus', () => {
    test('should return correct status codes for custom errors', () => {
      expect(getErrorStatus(new ValidationError('test'))).toBe(400);
      expect(getErrorStatus(new NotFoundError('Recipe'))).toBe(404);
      expect(getErrorStatus(new DatabaseError('test'))).toBe(500);
      expect(getErrorStatus(new ExternalAPIError('Service', 'test', 502))).toBe(502);
    });

    test('should return 500 for generic errors', () => {
      expect(getErrorStatus(new Error('generic error'))).toBe(500);
    });

    test('should handle ExternalAPIError without status code', () => {
      expect(getErrorStatus(new ExternalAPIError('Service', 'test'))).toBe(502);
    });
  });

  describe('getUserFriendlyMessage', () => {
    test('should return user-friendly messages for custom errors', () => {
      expect(getUserFriendlyMessage(new ValidationError('test message')))
        .toBe('test message');
      
      expect(getUserFriendlyMessage(new NotFoundError('Recipe')))
        .toBe('Recipe not found');
      
      expect(getUserFriendlyMessage(new DatabaseError('test')))
        .toBe('Database operation failed. Please try again later.');
      
      expect(getUserFriendlyMessage(new ExternalAPIError('Service', 'test')))
        .toBe('External service is temporarily unavailable. Please try again later.');
    });

    test('should return generic message for unknown errors', () => {
      expect(getUserFriendlyMessage(new Error('internal error')))
        .toBe('An unexpected error occurred. Please try again later.');
    });
  });

  describe('validateRequiredFields', () => {
    test('should not throw for valid data', () => {
      const data = { name: 'Test', email: 'test@example.com' };
      expect(() => validateRequiredFields(data, ['name', 'email'], 'User'))
        .not.toThrow();
    });

    test('should throw ValidationError for missing fields', () => {
      const data = { name: 'Test' };
      expect(() => validateRequiredFields(data, ['name', 'email'], 'User'))
        .toThrow(ValidationError);
      
      try {
        validateRequiredFields(data, ['name', 'email'], 'User');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message)
          .toBe('Missing required fields for User: email');
      }
    });

    test('should throw for empty string values', () => {
      const data = { name: '', email: 'test@example.com' };
      expect(() => validateRequiredFields(data, ['name', 'email'], 'User'))
        .toThrow('Missing required fields for User: name');
    });

    test('should throw for null and undefined values', () => {
      const data = { name: null, email: undefined };
      expect(() => validateRequiredFields(data, ['name', 'email'], 'User'))
        .toThrow('Missing required fields for User: name, email');
    });
  });

  describe('sanitizeInput', () => {
    test('should remove script tags from strings', () => {
      const input = '<script>alert("xss")</script>Hello';
      expect(sanitizeInput(input)).toBe('Hello');
    });

    test('should remove javascript: URLs', () => {
      const input = 'javascript:alert("xss")';
      expect(sanitizeInput(input)).toBe('alert("xss")');
    });

    test('should remove on* event handlers', () => {
      const input = 'onclick="alert()" onload="malicious()"';
      expect(sanitizeInput(input)).toBe('" "');
    });

    test('should trim whitespace', () => {
      const input = '  hello world  ';
      expect(sanitizeInput(input)).toBe('hello world');
    });

    test('should handle arrays recursively', () => {
      const input = ['<script>bad</script>test', 'normal'];
      const result = sanitizeInput(input);
      expect(result).toEqual(['test', 'normal']);
    });

    test('should handle objects recursively', () => {
      const input = {
        name: '<script>alert()</script>John',
        description: 'javascript:void(0)',
        nested: {
          value: 'onclick="bad"'
        }
      };
      const result = sanitizeInput(input);
      expect(result).toEqual({
        name: 'John',
        description: 'void(0)',
        nested: {
          value: '"'
        }
      });
    });

    test('should handle non-string primitives', () => {
      expect(sanitizeInput(123)).toBe(123);
      expect(sanitizeInput(true)).toBe(true);
      expect(sanitizeInput(null)).toBe(null);
      expect(sanitizeInput(undefined)).toBe(undefined);
    });
  });
});