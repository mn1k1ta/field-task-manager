using System.Text.Json;
using FieldTaskManager.Api.Domain.Entities;
using FieldTaskManager.Api.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace FieldTaskManager.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<FieldTask> FieldTasks => Set<FieldTask>();
    public DbSet<Comment> Comments => Set<Comment>();
    public DbSet<Attachment> Attachments => Set<Attachment>();

    // SQLite stores DateTime as TEXT and loses DateTimeKind on read (comes back Unspecified),
    // which makes the JSON serializer omit the 'Z' suffix and the SPA misread times as local.
    // Normalize every DateTime to UTC on write and re-stamp Kind=Utc on read.
    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
    }

    private sealed class UtcDateTimeConverter : ValueConverter<DateTime, DateTime>
    {
        public UtcDateTimeConverter() : base(
            v => v.Kind == DateTimeKind.Utc ? v : v.ToUniversalTime(),
            v => DateTime.SpecifyKind(v, DateTimeKind.Utc))
        {
        }
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.HasKey(u => u.Id);
            e.HasIndex(u => u.Username).IsUnique();
            e.Property(u => u.Username).IsRequired().HasMaxLength(256);
            e.Property(u => u.PasswordHash).IsRequired();
            e.Property(u => u.DisplayName).IsRequired().HasMaxLength(256);
            e.Property(u => u.Role).HasConversion<int>();
        });

        b.Entity<FieldTask>(e =>
        {
            e.HasKey(t => t.Id);
            e.Property(t => t.Title).IsRequired().HasMaxLength(200);
            e.Property(t => t.Description).HasMaxLength(8000);
            e.Property(t => t.Icon).IsRequired().HasMaxLength(16).HasDefaultValue("📍");
            // No DB-level default: the service always assigns a concrete Priority
            // (incl. Low=0). A database-generated default would make EF treat Low (the
            // CLR default 0) as "unset" and silently store Medium instead.
            e.Property(t => t.Priority).HasConversion<int>();
            e.Property(t => t.Status).HasConversion<int>();

            // Optional polygon area: a JSON array of [lat,lng] pairs in one nullable TEXT
            // column (no default — null means the task has no area). The required map anchor
            // stays in Latitude/Longitude.
            e.Property(t => t.Area).HasMaxLength(4000);

            // Labels: a List<string> persisted as a JSON array in one TEXT column. The
            // ValueComparer is required so EF change-tracking treats the collection by value
            // (deep-compare + snapshot) instead of by reference, avoiding spurious updates/warnings.
            e.Property(t => t.Labels)
                .HasConversion(
                    v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                    v => string.IsNullOrEmpty(v)
                        ? new List<string>()
                        : JsonSerializer.Deserialize<List<string>>(v, (JsonSerializerOptions?)null) ?? new List<string>())
                .Metadata.SetValueComparer(new ValueComparer<List<string>>(
                    (a, c) => (a ?? new List<string>()).SequenceEqual(c ?? new List<string>()),
                    v => v == null ? 0 : v.Aggregate(0, (h, s) => HashCode.Combine(h, s.GetHashCode())),
                    v => v == null ? new List<string>() : v.ToList()));

            e.HasIndex(t => t.AssigneeId);
            e.HasIndex(t => t.Status);
            e.HasOne(t => t.Assignee).WithMany(u => u.AssignedTasks)
             .HasForeignKey(t => t.AssigneeId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Comment>(e =>
        {
            e.HasKey(c => c.Id);
            e.Property(c => c.Body).IsRequired().HasMaxLength(2000);
            e.HasOne(c => c.FieldTask).WithMany(t => t.Comments)
             .HasForeignKey(c => c.FieldTaskId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(c => c.Author).WithMany(u => u.Comments)
             .HasForeignKey(c => c.AuthorId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Attachment>(e =>
        {
            e.HasKey(a => a.Id);
            e.Property(a => a.FileName).IsRequired().HasMaxLength(260);
            e.Property(a => a.ContentType).IsRequired().HasMaxLength(256);
            e.Property(a => a.StoredName).IsRequired().HasMaxLength(260);
            e.HasIndex(a => a.FieldTaskId);
            e.HasOne(a => a.FieldTask).WithMany(t => t.Attachments)
             .HasForeignKey(a => a.FieldTaskId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(a => a.UploadedBy).WithMany()
             .HasForeignKey(a => a.UploadedById).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
