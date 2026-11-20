"""Contract shared by folder preview, session creation and the per-session tool process."""
import importlib.util

import pytest

from api.adapters.mcp.registry import SubprocessToolRegistry, TOOL_SERVER
from api.domain.fence_rules import selected_folder


@pytest.mark.parametrize("value", [
    "", "/", "/Workspace/", "relative", "/Shared/../project", "/Shared/./project",
    "/Shared//project", "/Shared\\project", "/Shared/control\n", "/Workspace/Workspace/x",
    "/Shared/" + "x" * 506, "/Shared/quoted'",
])
def test_ambiguous_selection_is_rejected(value):
    with pytest.raises(ValueError):
        selected_folder(value)


@pytest.mark.parametrize("value,expected", [
    ("/Workspace/Shared/Revenue, FY26/", "/Shared/Revenue, FY26"),
    ("/Repos/分析", "/Repos/分析"),
    ("/Shared/" + "x" * 504, "/Shared/" + "x" * 504),
])
def test_selected_folder(value, expected):
    assert selected_folder(value) == expected


def test_comma_in_one_folder_is_preserved_by_the_tool_process(monkeypatch):
    folder = "/Shared/Revenue, FY26"
    env = SubprocessToolRegistry().environment("local", folder, None, None, 0, "/tmp")
    monkeypatch.setenv("NBMCP_SESSION_FOLDER", env["NBMCP_SESSION_FOLDER"])
    spec = importlib.util.spec_from_file_location("folder_tools", TOOL_SERVER)
    tools = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tools)
    assert tools.WRITE_PATHS == [folder + "/"]
    tools._check_path_scope(folder + "/report")
    with pytest.raises(PermissionError):
        tools._check_path_scope("/Shared/Other/report")
