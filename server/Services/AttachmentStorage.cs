using Microsoft.Extensions.Hosting;

namespace FieldTaskManager.Api.Services;

/// <summary>
/// Disk-backed storage for attachment binaries under {ContentRoot}/App_Data/uploads/{taskId}.
/// Keeps all path construction in one place so the service never builds file paths directly.
/// </summary>
public interface IAttachmentStorage
{
    /// <summary>Persists <paramref name="content"/> for a task under a fresh stored name; returns that name.</summary>
    Task<string> SaveAsync(Guid taskId, string originalFileName, Stream content, CancellationToken ct = default);

    /// <summary>Opens a read stream over a stored file, or null if it is missing on disk.</summary>
    Stream? OpenRead(Guid taskId, string storedName);

    /// <summary>Deletes a stored file if present; a missing file is treated as success.</summary>
    void Delete(Guid taskId, string storedName);
}

public class AttachmentStorage : IAttachmentStorage
{
    private readonly string _root;

    public AttachmentStorage(IHostEnvironment environment)
    {
        _root = Path.Combine(environment.ContentRootPath, "App_Data", "uploads");
    }

    public async Task<string> SaveAsync(Guid taskId, string originalFileName, Stream content, CancellationToken ct = default)
    {
        var dir = TaskDirectory(taskId);
        Directory.CreateDirectory(dir);

        var extension = Path.GetExtension(originalFileName);
        var storedName = $"{Guid.NewGuid():N}{extension}";
        var fullPath = Path.Combine(dir, storedName);

        await using var fileStream = new FileStream(fullPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        await content.CopyToAsync(fileStream, ct);

        return storedName;
    }

    public Stream? OpenRead(Guid taskId, string storedName)
    {
        var fullPath = Path.Combine(TaskDirectory(taskId), storedName);
        if (!File.Exists(fullPath))
        {
            return null;
        }

        return new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
    }

    public void Delete(Guid taskId, string storedName)
    {
        var fullPath = Path.Combine(TaskDirectory(taskId), storedName);
        if (File.Exists(fullPath))
        {
            File.Delete(fullPath);
        }
    }

    private string TaskDirectory(Guid taskId) => Path.Combine(_root, taskId.ToString());
}
