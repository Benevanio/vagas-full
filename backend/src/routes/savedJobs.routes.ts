import { Router } from "express";
import { validate } from "../middleware/validate";
import { SavedJobsController } from "../modules/savedJobs/savedJobs.controller";
import { ApplicationNotesController } from "../modules/savedJobs/applicationNotes.controller";
import { ApplicationNotesService } from "../modules/savedJobs/applicationNotes.service";
import { SavedJobsService } from "../modules/savedJobs/savedJobs.service";
import {
  createSavedJobSchema,
  savedJobParamsSchema,
  updateSavedJobSchema,
  applicationNoteParamsSchema,
  applicationNoteSchema,
} from "../modules/savedJobs/schemas/savedJobs.schemas";

const router = Router();
const service = new SavedJobsService();
const controller = new SavedJobsController(service);
const notesController = new ApplicationNotesController(new ApplicationNotesService());

router.get("/", (req, res, next) => {
  controller.getAll(req, res).catch(next);
});
router.get("/:id", (req, res, next) => {
  controller.getById(req, res).catch(next);
});
router.get("/:id/events", (req, res, next) => {
  controller.getEvents(req, res).catch(next);
});
router.get("/:id/notes", validate({ params: savedJobParamsSchema }), (req, res, next) => {
  notesController.list(req, res).catch(next);
});
router.post("/:id/notes", validate({ params: savedJobParamsSchema, body: applicationNoteSchema }), (req, res, next) => {
  notesController.create(req, res).catch(next);
});
router.patch("/:id/notes/:noteId", validate({ params: applicationNoteParamsSchema, body: applicationNoteSchema }), (req, res, next) => {
  notesController.update(req, res).catch(next);
});
router.delete("/:id/notes/:noteId", validate({ params: applicationNoteParamsSchema }), (req, res, next) => {
  notesController.delete(req, res).catch(next);
});
router.post("/", validate({ body: createSavedJobSchema }), (req, res, next) => {
  controller.create(req, res).catch(next);
});
router.patch(
  "/:id",
  validate({ params: savedJobParamsSchema, body: updateSavedJobSchema }),
  (req, res, next) => {
    controller.update(req, res).catch(next);
  },
);
router.delete(
  "/:id",
  validate({ params: savedJobParamsSchema }),
  (req, res, next) => {
    controller.delete(req, res).catch(next);
  },
);

export { router as savedJobsRoutes };
