import { prisma } from "../lib/prisma";

export const isHomeroomTeacherForClassroom = async (teacherId: bigint, classroomId: bigint) => {
  const homeroomStudent = await prisma.student.findFirst({
    where: {
      classroomId,
      classTeacherId: teacherId
    },
    select: { id: true }
  });

  return Boolean(homeroomStudent);
};

export const resolveTeacherClassroomAssociation = async (teacherId: bigint, classroomId: bigint) => {
  const [homeroom, subjectAssignment] = await Promise.all([
    isHomeroomTeacherForClassroom(teacherId, classroomId),
    prisma.teacherSubject.findFirst({
      where: {
        teacherId,
        classroomId
      },
      select: { id: true }
    })
  ]);

  return {
    homeroom,
    subject: Boolean(subjectAssignment)
  };
};

export const teacherCanViewClassroom = async (teacherId: bigint, classroomId: bigint) => {
  const association = await resolveTeacherClassroomAssociation(teacherId, classroomId);
  return association.homeroom || association.subject;
};
