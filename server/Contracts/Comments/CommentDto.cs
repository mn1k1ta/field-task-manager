namespace FieldTaskManager.Api.Contracts.Comments;

public record CommentDto(
    Guid Id,
    Guid TaskId,
    Guid AuthorId,
    string AuthorName,
    string Body,
    DateTime CreatedAtUtc
);
