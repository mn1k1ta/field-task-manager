using FieldTaskManager.Api.Contracts.Attachments;
using FieldTaskManager.Api.Security;
using FieldTaskManager.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FieldTaskManager.Api.Controllers;

[ApiController]
[Route("api/tasks/{taskId:guid}/attachments")]
[Authorize]
public class AttachmentsController : ControllerBase
{
    private readonly IAttachmentService _attachmentService;
    private readonly ICurrentUserAccessor _currentUser;

    public AttachmentsController(IAttachmentService attachmentService, ICurrentUserAccessor currentUser)
    {
        _attachmentService = attachmentService;
        _currentUser = currentUser;
    }

    /// <summary>List a task's attachments oldest-to-newest. Worker only own task (else 404).</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AttachmentDto>>> List(Guid taskId, CancellationToken ct)
    {
        var attachments = await _attachmentService.ListAsync(taskId, _currentUser.Current, ct);
        return Ok(attachments);
    }

    /// <summary>Upload a file (multipart/form-data). Worker only own task (else 404). Max 10 MB.</summary>
    [HttpPost]
    public async Task<ActionResult<AttachmentDto>> Upload(Guid taskId, IFormFile? file, CancellationToken ct)
    {
        var attachment = await _attachmentService.AddAsync(taskId, file, _currentUser.Current, ct);
        return CreatedAtAction(nameof(GetContent), new { taskId, attachmentId = attachment.Id }, attachment);
    }

    /// <summary>Stream an attachment's content inline with its content type. Ownership-checked (else 404).</summary>
    [HttpGet("{attachmentId:guid}/content")]
    public async Task<IActionResult> GetContent(Guid taskId, Guid attachmentId, CancellationToken ct)
    {
        var content = await _attachmentService.GetContentAsync(taskId, attachmentId, _currentUser.Current, ct);
        return File(content.Stream, content.ContentType);
    }

    /// <summary>Delete an attachment. Allowed for the uploader or an Admin (else 403).</summary>
    [HttpDelete("{attachmentId:guid}")]
    public async Task<IActionResult> Delete(Guid taskId, Guid attachmentId, CancellationToken ct)
    {
        await _attachmentService.DeleteAsync(taskId, attachmentId, _currentUser.Current, ct);
        return NoContent();
    }
}
