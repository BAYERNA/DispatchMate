-- Optional production enhancement. Run as a database owner only after validating
-- that the chosen PostgreSQL image provides PostGIS. V12 works without this file.
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE tactical_zones ADD COLUMN IF NOT EXISTS geometry_spatial geometry(Geometry, 4326);
ALTER TABLE operational_routes ADD COLUMN IF NOT EXISTS origin_spatial geometry(Point, 4326);
ALTER TABLE operational_routes ADD COLUMN IF NOT EXISTS destination_spatial geometry(Point, 4326);
CREATE INDEX IF NOT EXISTS idx_tactical_zones_spatial ON tactical_zones USING gist(geometry_spatial);
CREATE INDEX IF NOT EXISTS idx_operational_routes_origin_spatial ON operational_routes USING gist(origin_spatial);

UPDATE tactical_zones
SET geometry_spatial = ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326)
WHERE geometry_spatial IS NULL AND geometry ? 'type' AND geometry ? 'coordinates';
