using System.Linq;
using System.Reflection;
using System.Security.Claims;
using Jellyfin.Plugin.EasyPlugin.Configuration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.EasyPlugin.Api;

/// <summary>
/// Serves the client script (injected into <c>index.html</c>) and the layout it should apply.
/// <para>
/// Only <see cref="GetClientScript"/> is anonymous, because a <c>&lt;script src&gt;</c> tag carries
/// no credentials. Everything else needs a signed-in caller: the layout names every installed
/// plugin plus the admin's own group names, which is nothing an anonymous visitor should be able
/// to enumerate. The client script authenticates with the web app's own access token; when it has
/// none (e.g. on the login page) the request simply fails and the sidebar is left untouched.
/// </para>
/// </summary>
[ApiController]
[Route("EasyPlugin")]
public class EasyPluginController : ControllerBase
{
    // These endpoints use a plain [Authorize] rather than one of Jellyfin's named policies
    // ("RequiresElevation" and friends). Those names live in the server's Jellyfin.Api assembly,
    // which plugins do not reference, so naming one here would be an unverifiable string: get it
    // wrong and ASP.NET Core throws "policy not found" at request time, taking the sidebar down
    // with it. A bare [Authorize] only asks for an authenticated caller, which is the whole point
    // — stopping anonymous enumeration — and cannot fail that way. Neither endpoint needs more:
    // the layout is what the caller would see anyway, and a write only ever touches the caller's
    // own collapse record.

    /// <summary>Serves the embedded client script.</summary>
    /// <returns>The JavaScript file, or 404 if the resource is missing.</returns>
    [HttpGet("ClientScript")]
    [AllowAnonymous]
    [Produces("application/javascript")]
    public ActionResult GetClientScript()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var stream = assembly.GetManifestResourceStream("Jellyfin.Plugin.EasyPlugin.Web.client.js");
        if (stream is null)
        {
            return NotFound();
        }

        return File(stream, "application/javascript");
    }

    /// <summary>Returns the layout the calling user should see.</summary>
    /// <returns>The enabled flag and this user's effective layout.</returns>
    [HttpGet("Config")]
    [Authorize]
    [Produces("application/json")]
    public ActionResult GetConfig()
    {
        var c = Plugin.Instance!.Configuration;
        var layout = LayoutResolver.Resolve(c, GetUserId());

        return new JsonResult(new
        {
            enabled = c.Enabled,
            showSearch = c.ShowSearch,
            hidden = layout.Hidden,
            order = layout.Order,
            added = layout.Added.Select(a => new { name = a.Name, display = a.DisplayName }),
            groups = layout.Groups.Select(g => new { id = g.Id, name = g.Name, icon = g.Icon, members = g.Members }),
            renames = layout.Renames.Select(r => new { name = r.Name, display = r.DisplayName }),
            sections = layout.Sections.Select(s => new { id = s.Id, hidden = s.Hidden, order = s.Order }),
            collapsed = layout.Collapsed
        });
    }

    /// <summary>
    /// Remembers whether a group is collapsed for the calling user. Collapse state is personal and
    /// stored server-side, so it follows the user to other browsers and devices.
    /// </summary>
    /// <param name="request">The group and its new state.</param>
    /// <returns>204 on success, 400 when the group is missing.</returns>
    [HttpPost("Collapse")]
    [Authorize]
    public ActionResult SetCollapsed([FromBody] CollapseRequest request)
    {
        if (request is null || string.IsNullOrEmpty(request.GroupId))
        {
            return BadRequest();
        }

        var plugin = Plugin.Instance!;
        var config = plugin.Configuration;
        config.CollapseStates = LayoutResolver.SetCollapsed(config, GetUserId(), request.GroupId, request.Collapsed);
        plugin.UpdateConfiguration(config);

        return NoContent();
    }

    // The user id lives in a Jellyfin-specific claim; the standard ones are checked as a fallback
    // so this keeps working if the server changes which one it issues.
    private string? GetUserId()
    {
        string?[] candidates =
        {
            User?.FindFirstValue("Jellyfin-UserId"),
            User?.FindFirstValue(ClaimTypes.NameIdentifier),
            User?.FindFirstValue("sub")
        };

        return candidates.FirstOrDefault(v => !string.IsNullOrEmpty(v));
    }
}

/// <summary>The body of a collapse/expand request.</summary>
public class CollapseRequest
{
    /// <summary>Gets or sets the id of the group being toggled.</summary>
    public string GroupId { get; set; } = string.Empty;

    /// <summary>Gets or sets a value indicating whether the group is now collapsed.</summary>
    public bool Collapsed { get; set; }
}
