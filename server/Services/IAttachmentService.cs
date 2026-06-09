using FieldTaskManager.Api.Contracts.Attachments;
using FieldTaskManager.Api.Security;
using Microsoft.AspNetCore.Http;

namespace FieldTaskManager.Api.Services;

/// <summary>
/// Result of fetching an attachment's binary content: the open read stream plus the metadata
/// the controller needs to write the response (content type + original file name).
/// </summary>
public record AttachmentContent(Stream Stream, string ContentType, string FileName);

public interface IAttachmentService
{
    /// <summary>List a task's attachments oldest-to-newest. Worker only own task (else NotFoundException).</summary>
    Task<IReadOnlyList<AttachmentDto>> ListAsync(Guid taskId, CurrentUser current, CancellationToken ct = default);

    /// <summary>Upload a file to a task. Worker only own task (else NotFoundException). Rejects missing/oversize files (ValidationException).</summary>
    Task<AttachmentDto> AddAsync(Guid taskId, IFormFile? file, CurrentUser current, CancellationToken ct = default);

    /// <summary>Open the attachment's content stream for download/inline display. Ownership-checked (else NotFoundException).</summary>
    Task<AttachmentContent> GetContentAsync(Guid taskId, Guid attachmentId, CurrentUser current, CancellationToken ct = default);

    /// <summary>Delete an attachment (uploader or Admin only). Removes the row and the on-disk file.</summary>
    Task DeleteAsync(Guid taskId, Guid attachmentId, CurrentUser current, CancellationToken ct = default);
}
