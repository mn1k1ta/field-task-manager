namespace FieldTaskManager.Api.Security;

public interface ICurrentUserAccessor
{
    /// <summary>Resolves the current user from the request's JWT claims, or null if unauthenticated.</summary>
    CurrentUser? Get();

    /// <summary>Convenience accessor; throws if there is no authenticated user on the request.</summary>
    CurrentUser Current { get; }
}
