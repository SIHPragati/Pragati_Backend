-- AlterTable
ALTER TABLE `notification` ADD COLUMN `isPublic` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `user` MODIFY `role` ENUM('STUDENT', 'TEACHER', 'GOVERNMENT', 'PRINCIPAL', 'ADMIN') NOT NULL;

-- CreateTable
CREATE TABLE `ClassroomTimetable` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `schoolId` BIGINT NOT NULL,
    `classroomId` BIGINT NOT NULL,
    `weekDay` INTEGER NOT NULL,
    `period` INTEGER NOT NULL,
    `startTime` TIME(0) NULL,
    `endTime` TIME(0) NULL,
    `label` VARCHAR(80) NOT NULL,
    `location` VARCHAR(80) NULL,
    `notes` VARCHAR(255) NULL,
    `teacherSubjectId` BIGINT NULL,

    INDEX `ClassroomTimetable_schoolId_classroomId_weekDay_idx`(`schoolId`, `classroomId`, `weekDay`),
    UNIQUE INDEX `ClassroomTimetable_classroomId_weekDay_period_key`(`classroomId`, `weekDay`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Complaint` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `schoolId` BIGINT NOT NULL,
    `studentId` BIGINT NULL,
    `classroomId` BIGINT NULL,
    `reportedById` BIGINT NOT NULL,
    `category` ENUM('lack_of_proper_drinking_water', 'toilets', 'girls_toilets', 'liberty', 'proper_electricity', 'computers') NOT NULL,
    `description` TEXT NOT NULL,
    `isAnonymous` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('open', 'in_progress', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
    `resolutionNote` VARCHAR(500) NULL,
    `resolvedById` BIGINT NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Complaint_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `Complaint_reportedById_idx`(`reportedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Notification_isPublic_activeTill_idx` ON `Notification`(`isPublic`, `activeTill`);

-- AddForeignKey
ALTER TABLE `AttendanceSession` ADD CONSTRAINT `AttendanceSession_classroomId_fkey` FOREIGN KEY (`classroomId`) REFERENCES `Classroom`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClassroomTimetable` ADD CONSTRAINT `ClassroomTimetable_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClassroomTimetable` ADD CONSTRAINT `ClassroomTimetable_classroomId_fkey` FOREIGN KEY (`classroomId`) REFERENCES `Classroom`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClassroomTimetable` ADD CONSTRAINT `ClassroomTimetable_teacherSubjectId_fkey` FOREIGN KEY (`teacherSubjectId`) REFERENCES `TeacherSubject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_classroomId_fkey` FOREIGN KEY (`classroomId`) REFERENCES `Classroom`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_reportedById_fkey` FOREIGN KEY (`reportedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
