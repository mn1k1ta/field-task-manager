using FieldTaskManager.Api.Domain.Entities;
using FieldTaskManager.Api.Domain.Enums;

namespace FieldTaskManager.Api.Data;

public static class DbInitializer
{
    /// <summary>
    /// Idempotently seeds a single Admin user from the "SeedAdmin" configuration section.
    /// If any Admin user already exists, this is a no-op. The password is BCrypt-hashed.
    /// (Database migration is performed by <c>db.Database.Migrate()</c> in Program.cs before this runs.)
    /// </summary>
    public static void SeedAdmin(AppDbContext db, IConfiguration config)
    {
        if (db.Users.Any(u => u.Role == Role.Admin))
        {
            return;
        }

        var section = config.GetSection("SeedAdmin");
        var username = section["Username"] ?? "admin";
        var password = section["Password"] ?? "Admin#12345";
        var displayName = section["DisplayName"];

        if (string.IsNullOrWhiteSpace(displayName))
        {
            displayName = username;
        }

        var admin = new User
        {
            Id = Guid.NewGuid(),
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            Role = Role.Admin,
            DisplayName = displayName,
            CreatedAtUtc = DateTime.UtcNow
        };

        db.Users.Add(admin);
        db.SaveChanges();
    }
}
