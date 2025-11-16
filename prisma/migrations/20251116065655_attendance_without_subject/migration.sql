/*
  Warnings:

  - You are about to drop the column `subjectId` on the `attendancesession` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[classroomId,sessionDate]` on the table `AttendanceSession` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `attendancesession` DROP FOREIGN KEY `AttendanceSession_classroomId_fkey`;

-- DropForeignKey
ALTER TABLE `attendancesession` DROP FOREIGN KEY `AttendanceSession_subjectId_fkey`;

-- DropIndex
DROP INDEX `AttendanceSession_classroomId_subjectId_sessionDate_startsAt_key` ON `attendancesession`;

-- DropIndex
DROP INDEX `AttendanceSession_subjectId_fkey` ON `attendancesession`;

-- AlterTable
ALTER TABLE `attendancesession` DROP COLUMN `subjectId`;

-- AlterTable
ALTER TABLE `student` ADD COLUMN `classTeacherId` BIGINT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `AttendanceSession_classroomId_sessionDate_key` ON `AttendanceSession`(`classroomId`, `sessionDate`);

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_classTeacherId_fkey` FOREIGN KEY (`classTeacherId`) REFERENCES `Teacher`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
