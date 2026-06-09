namespace FieldTaskManager.Api.Common;

/// <summary>Resource missing, or hidden from a Worker by ownership scoping. Maps to HTTP 404.</summary>
public class NotFoundException : Exception
{
    public NotFoundException(string message = "The requested resource was not found.") : base(message) { }
}

/// <summary>Authenticated but role/ownership authority denied. Maps to HTTP 403.</summary>
public class ForbiddenException : Exception
{
    public ForbiddenException(string message = "You do not have permission to perform this action.") : base(message) { }
}

/// <summary>Missing/invalid credentials on login. Maps to HTTP 401.</summary>
public class UnauthorizedException : Exception
{
    public UnauthorizedException(string message = "Invalid username or password.") : base(message) { }
}

/// <summary>Validation failure or illegal/no-op state transition. Maps to HTTP 400.</summary>
public class ValidationException : Exception
{
    public ValidationException(string message = "The request is invalid.") : base(message) { }
}

/// <summary>Conflict with current state, e.g. duplicate username on register. Maps to HTTP 409.</summary>
public class ConflictException : Exception
{
    public ConflictException(string message = "The request conflicts with the current state of the resource.") : base(message) { }
}
