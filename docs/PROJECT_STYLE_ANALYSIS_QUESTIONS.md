# Project Style - Visual Analysis Questionnaire

Status: historical source document. `STYLE.1` is now implemented and was
accepted by the user on 2026-08-02 (`STYLE.1.ACCEPTANCE.1`, `ACCEPTED`).
Kept as the original questionnaire that guided the Style Bible design, not
as a live status page.

## Purpose

This document preserves the product questions that guided the `STYLE.1`
work and the design of a Project Style Bible in MikAI ProdLab.

The Style Bible must describe a reusable visual language. It must not become a
single free-text prompt. It should separate observable rules, visual
references, negative constraints, and intentional variations across the
Project, Sequences, and Shots.

## 1. General Intent

- What visual genre does the image evoke?
- What primary emotion should it communicate?
- Which keywords best summarize its identity?
- Does it look realistic, stylized, graphic, pictorial, or hybrid?
- Which characteristics must remain constant throughout the Project?

## 2. Palette And Color Script

- What are the dominant, secondary, and accent colors?
- Is the palette warm, cool, neutral, or strongly contrasted?
- Are the colors saturated or desaturated?
- How do colors evolve between shadows, midtones, and highlights?
- Are some colors prohibited?
- Should the color script change according to Sequence, location, time, or
  narrative beat?

## 3. Lighting

- What is the primary light source: natural, artificial, diffuse, or
  directional?
- Where does the main light come from?
- Is the light soft or hard?
- What is its color temperature?
- Is the contrast low, cinematic, or highly dramatic?
- Are backlight, rim light, volumetric light, or bloom part of the language?
- How are characters separated from the environment?

## 4. Shadows And Specular Treatment

- Are shadows sharp, diffuse, deep, lifted, or colored?
- Do dark areas retain visible detail?
- Are surfaces matte, satin, glossy, wet, or metallic?
- Are highlights controlled or blooming?
- How should skin, eyes, fur, hair, metal, fabric, glass, and other recurring
  materials react to light?

## 5. Rendering And Pictorial Treatment

- Is the target photography, 2D animation, 3D animation, illustration,
  painting, concept art, or a hybrid?
- Is the rendering clean, textured, sketched, handmade, or deliberately
  imperfect?
- What level of detail is expected?
- Are materials realistic or simplified?
- Are grain, noise, outlines, hatching, brush strokes, or graphic overlays
  present?
- Does the image evoke a studio production, a feature film, an editorial
  illustration, or another visual tradition?

## 6. Camera And Composition

- Which shot sizes dominate?
- Which camera heights and angles are preferred?
- What lens feeling is expected: wide-angle, natural, or telephoto?
- What depth of field is typical?
- Are compositions symmetrical, centered, dynamic, layered, or graphic?
- How much negative space should surround characters?
- How are foreground, subject, and background organized?

## 7. Character Design

- Which rules define silhouettes and proportions?
- What degree of anatomical stylization is expected?
- How should faces, eyes, hair or fur, costumes, and accessories be treated?
- Which expressions, poses, and acting choices fit the Project?
- Which identity details must remain consistent?
- Which variations would be considered incorrect?

## 8. Environments And Set Dressing

- Which architectural and decorative language should be used?
- How dense should set dressing be?
- Are environments realistic, simplified, theatrical, or graphic?
- Which materials, shapes, patterns, and props recur?
- How should visual unity be maintained across locations?
- Which objects or motifs characterize the world?

## 9. Motion Language

- Which movement language matches the visual style?
- Should poses be natural, exaggerated, restrained, or highly composed?
- Should camera movement feel stable, fluid, documentary, handheld, or
  dynamic?
- What motion-blur treatment is appropriate?
- What rhythm should the animated result communicate?

## 10. Negative Style Constraints

- What would immediately make an image feel outside the Project's style?
- Which rendering styles, colors, lighting setups, or compositions must be
  excluded?
- Which common model-generation defects should be explicitly prohibited?
- Which elements from a style reference must never be copied literally?

## 11. Role Of Each Reference

- Which information should be extracted from each reference image?
- Is the reference intended for palette, lighting, rendering, camera,
  environment, character design, texture, or another role?
- Which aspects may be interpreted freely?
- Which aspects must be followed faithfully?
- Is the reference global to the Project or specific to a Sequence or Shot?
- Must the reference affect image generation, video generation, storyboard
  generation, or several of them?

## 12. MikAI Product And Prompt Integration

- Which rules belong to the whole Project?
- Which rules may be overridden at Sequence or Shot level?
- Which Style Bible fields must be injected into every compiled prompt?
- Which rules apply only to images, videos, or storyboards?
- How should the compiled prompt expose the Style Bible sections and sources it
  actually used?
- How should MikAI signal that a generation diverges from the Style Bible?
- How should a user distinguish a global style reference from a character,
  environment, camera, or continuity reference?
- Which fields should remain structured and which, if any, need free text?

## Expected STYLE.1 Outcome

Before implementation, `STYLE.1` should use this questionnaire to define:

- the structured Style Bible fields;
- the visual-reference roles and analysis directives;
- Project defaults and Sequence/Shot override rules;
- negative constraints;
- prompt compiler injection rules;
- image, video, and storyboard applicability;
- source visibility and validation criteria;
- schema or migration needs, decided from the resulting product model rather
  than avoided by default.
