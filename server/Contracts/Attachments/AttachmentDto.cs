namespace FieldTaskManager.Api.Contracts.Attachments;

public record AttachmentDto(
    Guid Id,
    Guid TaskId,
    string FileName,
    string ContentType,
    long SizeBytes,
    bool IsImage,
    Guid UploadedById,
    string UploadedByName,
    DateTime UploadedAtUtc,
    string Url
);
