namespace FieldTaskManager.Api.Domain.Entities;

public class Attachment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid FieldTaskId { get; set; }

    public FieldTask FieldTask { get; set; } = null!;

    /// <summary>The original client file name (preserved for display/download).</summary>
    public string FileName { get; set; } = string.Empty;

    public string ContentType { get; set; } = string.Empty;

    public long SizeBytes { get; set; }

    /// <summary>The on-disk file name (a GUID + extension) under App_Data/uploads/{taskId}.</summary>
    public string StoredName { get; set; } = string.Empty;

    public Guid UploadedById { get; set; }

    public User UploadedBy { get; set; } = null!;

    public DateTime UploadedAtUtc { get; set; }
}
