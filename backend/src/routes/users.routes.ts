import { Router } from "express";
import { validate } from "../middleware/validate";
import { UsersController } from "../modules/users/users.controller";
import { UsersService } from "../modules/users/users.service";
import {
  createPreferencesSchema,
  deleteAccountSchema,
  updatePreferencesSchema,
  updateProfileSchema,
} from "../modules/users/schemas/user.schemas";

const router = Router();
const usersService = new UsersService();
const usersController = new UsersController(usersService);

router.get("/profile", (req, res, next) => {
  usersController.getProfile(req, res).catch(next);
});
router.patch(
  "/profile",
  validate({ body: updateProfileSchema }),
  (req, res, next) => {
    usersController.updateProfile(req, res).catch(next);
  },
);
router.get("/export", (req, res, next) => {
  usersController.exportData(req, res).catch(next);
});
router.delete(
  "/account",
  validate({ body: deleteAccountSchema }),
  (req, res, next) => {
    usersController.deleteAccount(req, res).catch(next);
  },
);
router.get("/preferences", (req, res, next) => {
  usersController.getPreferences(req, res).catch(next);
});
router.post(
  "/preferences",
  validate({ body: createPreferencesSchema }),
  (req, res, next) => {
    usersController.createPreferences(req, res).catch(next);
  },
);
router.patch(
  "/preferences",
  validate({ body: updatePreferencesSchema }),
  (req, res, next) => {
    usersController.updatePreferences(req, res).catch(next);
  },
);

export { router as userRoutes };
