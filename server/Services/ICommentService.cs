using FieldTaskManager.Api.Contracts.Comments;
using FieldTaskManager.Api.Security;

namespace FieldTaskManager.Api.Services;

public interface ICommentService
{
    /// <summary>List a task's comments oldest-to-newest. Worker only own task (else NotFoundException).</summary>
    Task<IReadOnlyList<CommentDto>> ListAsync(Guid taskId, CurrentUser current, CancellationToken ct = default);

    /// <summary>Add a comment. Worker only own task (else NotFoundException). Author = current user; timestamp server-assigned.</summary>
    Task<CommentDto> AddAsync(Guid taskId, CreateCommentRequest request, CurrentUser current, CancellationToken ct = default);
}
