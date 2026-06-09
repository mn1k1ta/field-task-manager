using System.Text;
using FieldTaskManager.Api.Common;
using FieldTaskManager.Api.Data;
using FieldTaskManager.Api.Security;
using FieldTaskManager.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;

var builder = WebApplication.CreateBuilder(args);

// --- Persistence (EF Core + SQLite) ---
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default")));

// --- JWT settings ---
builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection("Jwt"));
var jwtSettings = builder.Configuration.GetSection("Jwt").Get<JwtSettings>()
    ?? throw new InvalidOperationException("Missing 'Jwt' configuration section.");

// --- Authentication (JWT bearer) ---
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Keep the JWT claim names exactly as issued (sub/role/name) instead of
        // remapping the short names to long WS-* URIs, so the SPA and server agree.
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtSettings.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtSettings.Audience,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.SigningKey)),
            RoleClaimType = "role",
            NameClaimType = "name"
        };
    });

builder.Services.AddAuthorization();

// --- MVC controllers; enums serialize as integers (default System.Text.Json behavior) ---
builder.Services.AddControllers()
    .AddJsonOptions(_ =>
    {
        // Intentionally no JsonStringEnumConverter: enums serialize as their integer
        // values on the wire, matching the API contract (architecture §3.4 / §9).
    });

builder.Services.AddHttpContextAccessor();

// --- Centralized RFC 7807 error handling ---
builder.Services.AddExceptionHandler<ProblemDetailsExceptionHandler>();
builder.Services.AddProblemDetails();

// --- OpenAPI (built-in, dev only) ---
builder.Services.AddOpenApi();

// --- Dependency injection: security + application services (all scoped) ---
builder.Services.AddScoped<ICurrentUserAccessor, CurrentUserAccessor>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<ITaskService, TaskService>();
builder.Services.AddScoped<ICommentService, CommentService>();
builder.Services.AddScoped<IAttachmentService, AttachmentService>();
builder.Services.AddScoped<IAttachmentStorage, AttachmentStorage>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<StatusTransitionService>();

// --- Dev-only CORS for the ng serve origin ---
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddCors(options => options.AddPolicy("dev", policy =>
        policy.WithOrigins("http://localhost:4200")
              .AllowAnyHeader()
              .AllowAnyMethod()));
}

var app = builder.Build();

// --- Startup: migrate then idempotently seed the Admin (FR-20, FR-2) ---
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
    DbInitializer.SeedAdmin(db, app.Configuration);
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseCors("dev");
}

app.UseExceptionHandler();

app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapFallbackToFile("index.html");

app.Run();
