using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace FieldTaskManager.Tests.Integration;

/// <summary>
/// Boots the real ASP.NET Core host (Program) over an ISOLATED SQLite file database, unique per
/// factory instance. The app's startup runs Database.Migrate() + the idempotent admin seed, so the
/// seeded admin (admin / Admin#12345, from configuration) is available to every test that uses this
/// factory. The DB file is removed on Dispose so test classes never share state.
///
/// The environment is forced to "Testing" (not Development) so the dev-only CORS branch is skipped
/// and no Development settings interfere; the seeded admin and JWT config still come from
/// appsettings.json which is copied next to the test assembly via the project reference.
/// </summary>
public sealed class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath = Path.Combine(
        Path.GetTempPath(), $"ftm-test-{Guid.NewGuid():N}.db");

    public const string SeedAdminUsername = "admin";
    public const string SeedAdminPassword = "Admin#12345";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                // Only the DB is isolated per factory. Jwt + SeedAdmin come from the app's
                // appsettings.json so token ISSUANCE and VALIDATION read the SAME key — under the
                // minimal-hosting model the validation params are read eagerly (before the
                // factory's config override applies), while IOptions<JwtSettings> binds from the
                // final config, so overriding Jwt here would sign with one key and validate with
                // another (=> 401 on every authenticated request). SeedAdmin already matches.
                ["ConnectionStrings:Default"] = $"Data Source={_dbPath}"
            });
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            TryDeleteDbFiles();
        }
    }

    private void TryDeleteDbFiles()
    {
        // SQLite may leave -wal / -shm sidecar files; remove them too.
        foreach (var path in new[] { _dbPath, _dbPath + "-wal", _dbPath + "-shm" })
        {
            try
            {
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
            }
            catch (IOException)
            {
                // Best-effort cleanup; a locked file does not fail the test run.
            }
        }
    }
}
