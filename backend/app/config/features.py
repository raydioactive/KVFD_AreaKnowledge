"""
Feature flags for modular architecture.
Enables/disables features without code changes.
"""
from pydantic import BaseModel
from typing import Literal


class FeatureFlags(BaseModel):
    """Feature flags configuration"""

    # Map features
    enable_street_labels_toggle: bool = True
    default_map_mode: Literal["training", "reference"] = "training"
    enable_gis_layers: bool = True
    enable_fire_box_layer: bool = True
    default_show_fire_boxes: bool = False  # Start hidden for training mode

    # Quiz modes (can be disabled individually)
    quiz_beat_identification: bool = True
    quiz_facility_location: bool = True
    quiz_protocol_destination: bool = True
    quiz_turn_by_turn: bool = True

    # Data sources
    enable_moco_gis_sync: bool = True
    enable_osm_supplement: bool = True
    enable_hhs_nursing_homes: bool = True

    # Advanced features
    enable_spaced_repetition: bool = True
    enable_protocol_engine: bool = True
    enable_routing: bool = True

    # UI features
    enable_dark_mode: bool = True
    enable_dashboard: bool = True
    enable_progress_tracking: bool = True

    # Facility layers
    enable_hospitals_layer: bool = True
    enable_stations_layer: bool = True
    enable_nursing_homes_layer: bool = True

    class Config:
        """Pydantic configuration"""
        validate_assignment = True


# Global feature flags instance
features = FeatureFlags()


def get_features() -> dict:
    """
    Get feature flags as dictionary for API responses.

    Returns:
        dict: Feature flags configuration
    """
    return features.model_dump()
