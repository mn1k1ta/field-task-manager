using FieldTaskManager.Api.Domain.Entities;

namespace FieldTaskManager.Api.Services;

public interface ITokenService
{
    /// <summary>Create a signed JWT for the given user with sub/role/name claims and configured issuer/audience/lifetime.</summary>
    string CreateToken(User user);
}
