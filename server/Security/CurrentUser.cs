using FieldTaskManager.Api.Domain.Enums;

namespace FieldTaskManager.Api.Security;

public record CurrentUser(Guid Id, Role Role, string Name);
