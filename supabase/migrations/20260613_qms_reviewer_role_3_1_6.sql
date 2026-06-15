-- §3.1.6 reviewer competences: reviewers are domain specialists with a
-- relevant qualification in the domain from an institution of higher learning
-- and/or experience in the domain. Adds the role type + its competence basis.

INSERT INTO qms.role_types (code, name, iso_clause_reference, description)
VALUES ('reviewer', 'Reviewer',
        'ISO 17100:2015 §3.1.6',
        'Monolingual examination of target language content for domain accuracy and text-type conventions. Reviewers are domain specialists.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO qms.competence_bases (code, role_type_code, iso_clause_reference, short_label, description)
VALUES ('rev_domain_specialist', 'reviewer',
        'ISO 17100:2015 §3.1.6',
        'Domain specialist — qualification and/or experience in the domain',
        'Relevant qualification in the domain from an institution of higher learning, and/or documented experience in the domain.')
ON CONFLICT (code) DO NOTHING;

-- A reviewer-appropriate evidence type for domain expertise already exists
-- (domain_specific_certification); also allow documented experience.
INSERT INTO qms.evidence_types (code, name, description, applies_to_roles, iso_clause_reference)
VALUES ('domain_experience', 'Documented domain experience',
        'Evidence of professional experience in the subject-matter domain (e.g. employment, publications, practice).',
        ARRAY['reviewer','reviser'], 'ISO 17100:2015 §3.1.6')
ON CONFLICT (code) DO NOTHING;
