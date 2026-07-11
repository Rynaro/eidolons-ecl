"""Strict JSON-Schema validation of `contracts/*.yaml` against
`schemas/handoff-contract.v1.json`.

Added alongside the Gilgamesh edge contracts (ESL change
`generalist-eidolon`, Track F) to lock in that `edge_origin:
emitted-request` — pinned by R-050/AC-F05 on Gilgamesh's five outbound
hand-off-request edges — validates strictly now that the enum was widened
additively (v2.2) to admit it. See `spec/ecl-2.1.md` §3.3 and
`contracts/README.md` §"Gilgamesh edges" for the semantics.
"""

from __future__ import annotations

import json
import pathlib

import pytest
import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

_TESTS_DIR = pathlib.Path(__file__).parent
_REPO_ROOT = _TESTS_DIR.parent.parent.parent  # tests/.. /py/.. /reference-sdk/.. = repo root
_CONTRACTS_DIR = _REPO_ROOT / "contracts"
_SCHEMAS_DIR = _REPO_ROOT / "schemas"


def _contract_validator() -> Draft202012Validator:
    """Build a strict validator for `handoff-contract.v1.json`, resolving
    its local `$ref` to `performative.v1.json` via a Registry so no network
    access is attempted for the `$id`-addressed schema."""
    resources = []
    for path in _SCHEMAS_DIR.glob("*.json"):
        doc = json.loads(path.read_text(encoding="utf-8"))
        resources.append(Resource.from_contents(doc))
    registry: Registry = Registry().with_resources((r.id(), r) for r in resources)  # type: ignore[arg-type]

    schema_path = _SCHEMAS_DIR / "handoff-contract.v1.json"
    contract_schema = json.loads(schema_path.read_text(encoding="utf-8"))
    return Draft202012Validator(contract_schema, registry=registry)


GILGAMESH_CONTRACTS = [
    "human-to-gilgamesh.yaml",
    "orchestrator-to-gilgamesh.yaml",
    "gilgamesh-to-atlas.yaml",
    "gilgamesh-to-kupo.yaml",
    "gilgamesh-to-vigil.yaml",
    "gilgamesh-to-idg.yaml",
    "gilgamesh-to-forge.yaml",
    "forge-to-gilgamesh.yaml",
]

EMITTED_REQUEST_CONTRACTS = [
    "gilgamesh-to-atlas.yaml",
    "gilgamesh-to-kupo.yaml",
    "gilgamesh-to-vigil.yaml",
    "gilgamesh-to-idg.yaml",
    "gilgamesh-to-forge.yaml",
]


@pytest.mark.parametrize("filename", EMITTED_REQUEST_CONTRACTS)
def test_emitted_request_contract_validates_strictly(filename: str) -> None:
    """The five `edge_origin: emitted-request` outbound contracts MUST
    validate cleanly now that the enum admits the value (v2.2)."""
    validator = _contract_validator()
    contract = yaml.safe_load((_CONTRACTS_DIR / filename).read_text(encoding="utf-8"))
    assert contract["edge_origin"] == "emitted-request"
    errors = list(validator.iter_errors(contract))
    assert errors == [], f"{filename}: {[e.message for e in errors]}"


@pytest.mark.parametrize("filename", GILGAMESH_CONTRACTS)
def test_all_gilgamesh_contracts_validate_strictly(filename: str) -> None:
    """All eight Gilgamesh edge contracts (inbound, outbound, lateral)
    validate against `handoff-contract.v1.json` with zero errors."""
    validator = _contract_validator()
    contract = yaml.safe_load((_CONTRACTS_DIR / filename).read_text(encoding="utf-8"))
    errors = list(validator.iter_errors(contract))
    assert errors == [], f"{filename}: {[e.message for e in errors]}"


def test_edge_origin_enum_is_additive() -> None:
    """The widened enum still admits the three original values (backward
    compatible — no existing contract's edge_origin is invalidated)."""
    schema = json.loads((_SCHEMAS_DIR / "handoff-contract.v1.json").read_text(encoding="utf-8"))
    enum = schema["properties"]["edge_origin"]["enum"]
    assert set(enum) == {"roster", "composition", "implicit", "emitted-request"}
