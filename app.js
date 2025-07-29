class ExamSystem {
    constructor() {
        this.questions = [];
        this.currentQuestion = null;
        this.currentQuestionIndex = 0;
        this.userAnswers = {};
        this.questionStats = this.loadQuestionStats();
        this.wrongQuestions = this.loadWrongQuestions();
        this.currentMode = 'practice';
        this.examQuestions = [];
        this.examStartTime = null;
        this.examTimer = null;
        this.examDuration = 120; // 默认120分钟
        this.wrongBankIndex = 0;
        // 在这里直接设置答题顺序: 'sequential' 为顺序, 'random' 为随机
        this.questionOrder = 'sequential'; 
        this.sequentialIndex = this.loadSetting('sequentialIndex', 0); // 加载上次的答题位置
        
        this.init();
    }

    async init() {
        this.addJumpControls(); // 在页面上添加跳转UI
        await this.loadQuestions();
        this.bindEvents();
        this.initMobileFeatures(); // 新增
        this.updateStats();
        this.showInitialQuestion(); // 修改为调用新的方法
    }

    // 新增：根据模式和保存的进度显示初始题目
    showInitialQuestion() {
        if (this.questions.length === 0) return;

        if (this.questionOrder === 'sequential') {
            // 如果是顺序模式，跳转到上次保存的索引
            this.jumpToQuestionByIndex(this.sequentialIndex, true);
        } else {
            // 随机模式
            this.showNextQuestion();
        }
    }

    // 新增：在练习模式控制区添加跳转UI
    addJumpControls() {
        const practiceActions = document.querySelector('#practiceMode .question-actions');
        if (practiceActions) {
            const jumpContainer = document.createElement('div');
            jumpContainer.className = 'jump-container';
            jumpContainer.style.marginTop = '15px';
            jumpContainer.style.display = 'flex';
            jumpContainer.style.gap = '10px';
            jumpContainer.innerHTML = `
                <input type="number" id="jumpToQuestionInput" placeholder="输入题号跳转" style="flex-grow: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                <button id="jumpToQuestionBtn" class="btn btn-secondary">跳转</button>
            `;
            practiceActions.parentElement.insertBefore(jumpContainer, practiceActions.nextSibling);
        }
    }

    // 移动端特性初始化方法
    initMobileFeatures() {
        // 阻止双击缩放
        let lastTouchEnd = 0;
        document.addEventListener('touchend', function (event) {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, false);

        // 监听设备方向变化
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.adjustLayout();
            }, 100);
        });

        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            this.adjustLayout();
        });

        // 添加触摸滑动支持（在考试模式下）
        this.addSwipeSupport();
    }

    // 布局调整方法
    adjustLayout() {
        // 重新计算答题卡布局
        const answerSheet = document.getElementById('answerSheet');
        if (answerSheet && this.currentMode === 'exam') {
            this.updateAnswerSheet();
        }

        // 调整题目图片大小
        const images = document.querySelectorAll('.question-image img');
        images.forEach(img => {
            if (img.naturalWidth > 0) {
                const containerWidth = img.parentElement.clientWidth;
                if (img.naturalWidth > containerWidth) {
                    img.style.width = '100%';
                    img.style.height = 'auto';
                }
            }
        });
    }

    // 添加滑动支持
    addSwipeSupport() {
        let touchStartX = 0;
        let touchStartY = 0;
        const minSwipeDistance = 50;

        document.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        });

        document.addEventListener('touchend', (e) => {
            if (this.currentMode !== 'exam') return;

            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const diffX = touchStartX - touchEndX;
            const diffY = touchStartY - touchEndY;

            // 确保是水平滑动且距离足够
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > minSwipeDistance) {
                if (diffX > 0) {
                    // 向左滑动 - 下一题
                    this.examNextQuestion();
                } else {
                    // 向右滑动 - 上一题
                    this.examPrevQuestion();
                }
            }
        });
    }

    // 优化选项选择方法，增加触摸反馈
    selectOption(optionDiv, optionLetter, mode) {
        const question = mode === 'wrongBank' ? this.wrongQuestions[this.wrongBankIndex] : this.currentQuestion;
        const isMultiple = Array.isArray(question.answer) && question.answer.length > 1;
        const input = optionDiv.querySelector('input');

        // 添加触摸反馈
        optionDiv.style.transform = 'scale(0.98)';
        setTimeout(() => {
            optionDiv.style.transform = 'scale(1)';
        }, 150);

        if (isMultiple) {
            // 多选题
            input.checked = !input.checked;
            if (input.checked) {
                optionDiv.classList.add('selected');
            } else {
                optionDiv.classList.remove('selected');
            }
        } else {
            // 单选题
            const prefix = mode === 'practice' ? '' : mode === 'wrongBank' ? 'wrong' : 'exam';
            const allOptions = document.querySelectorAll(`#${prefix}Options .option`);
            allOptions.forEach(opt => {
                opt.classList.remove('selected');
                opt.querySelector('input').checked = false;
            });
            
            optionDiv.classList.add('selected');
            input.checked = true;
        }

        // 如果是考试模式，保存答案
        if (mode === 'exam') {
            const selectedAnswers = this.getSelectedAnswers('exam');
            this.userAnswers[this.examQuestions[this.currentQuestionIndex].id] = selectedAnswers;
            this.updateAnswerSheet();
        }
    }

    // 优化考试模式的答题卡更新
    updateAnswerSheet() {
        const answerSheet = document.getElementById('answerSheet');
        if (!answerSheet) return;

        answerSheet.innerHTML = '';
        
        this.examQuestions.forEach((question, index) => {
            const answerItem = document.createElement('div');
            answerItem.className = 'answer-item';
            answerItem.textContent = index + 1;
            
            if (index === this.currentQuestionIndex) {
                answerItem.classList.add('current');
            }
            
            if (this.userAnswers[question.id] && this.userAnswers[question.id].length > 0) {
                answerItem.classList.add('answered');
            }
            
            answerItem.addEventListener('click', () => {
                this.currentQuestionIndex = index;
                this.displayQuestion('exam');
                this.updateExamProgress();
                this.updateAnswerSheet();
            });
            
            answerSheet.appendChild(answerItem);
        });
    }

    async loadQuestions() {
        this.questions = EXAM_QUESTIONS || [];
        // try {
        //     // 首先尝试从JSON文件加载
        //     // const response = await fetch('exam_questions.json');
        //     const response = await fetch('exam.json');
        //     this.questions = await response.json();
        //     console.log(`从JSON文件加载了 ${this.questions.length} 道题目`);
        // } catch (error) {
        //     console.warn('从JSON文件加载失败，尝试使用内嵌数据:', error);
        //     // 如果JSON文件加载失败，回退到内嵌数据
        //     try {
        //         if (typeof EXAM_QUESTIONS !== 'undefined') {
        //             this.questions = EXAM_QUESTIONS;
        //             console.log(`从内嵌数据加载了 ${this.questions.length} 道题目`);
        //         } else {
        //             throw new Error('内嵌题目数据未找到');
        //         }
        //     } catch (innerError) {
        //         console.error('加载题目失败:', innerError);
        //         alert('加载题目失败，请检查exam_questions.json文件或questions.js文件');
        //     }
        // }
    }

    bindEvents() {
        // 导航按钮事件 - 添加安全检查
        const practiceBtn = document.getElementById('practiceBtn');
        const wrongBankBtn = document.getElementById('wrongBankBtn');
        const examBtn = document.getElementById('examBtn');
        const statsBtn = document.getElementById('statsBtn');
        
        if (practiceBtn) practiceBtn.addEventListener('click', () => this.switchMode('practice'));
        if (wrongBankBtn) wrongBankBtn.addEventListener('click', () => this.switchMode('wrongBank'));
        if (examBtn) examBtn.addEventListener('click', () => this.switchMode('exam'));
        if (statsBtn) statsBtn.addEventListener('click', () => this.switchMode('stats'));

        // 练习模式事件 - 添加安全检查
        const submitAnswerBtn = document.getElementById('submitAnswer');
        const nextQuestionBtn = document.getElementById('nextQuestion');
        const showExplanationBtn = document.getElementById('showExplanation');
        
        if (submitAnswerBtn) submitAnswerBtn.addEventListener('click', () => this.submitAnswer());
        if (nextQuestionBtn) nextQuestionBtn.addEventListener('click', () => this.nextQuestion());
        if (showExplanationBtn) showExplanationBtn.addEventListener('click', () => this.showExplanation());

        // 跳转按钮事件
        const jumpToQuestionBtn = document.getElementById('jumpToQuestionBtn');
        if (jumpToQuestionBtn) {
            jumpToQuestionBtn.addEventListener('click', () => this.jumpToQuestionById());
        }

        // 错题库事件 - 添加安全检查
        const startWrongBankBtn = document.getElementById('startWrongBank');
        const clearWrongBankBtn = document.getElementById('clearWrongBank');
        const submitWrongAnswerBtn = document.getElementById('submitWrongAnswer');
        const nextWrongQuestionBtn = document.getElementById('nextWrongQuestion');
        const showWrongExplanationBtn = document.getElementById('showWrongExplanation');
        const removeFromWrongBankBtn = document.getElementById('removeFromWrongBank');
        
        if (startWrongBankBtn) startWrongBankBtn.addEventListener('click', () => this.startWrongBank());
        if (clearWrongBankBtn) clearWrongBankBtn.addEventListener('click', () => this.clearWrongBank());
        if (submitWrongAnswerBtn) submitWrongAnswerBtn.addEventListener('click', () => this.submitWrongAnswer());
        if (nextWrongQuestionBtn) nextWrongQuestionBtn.addEventListener('click', () => this.nextWrongQuestion());
        if (showWrongExplanationBtn) showWrongExplanationBtn.addEventListener('click', () => this.showWrongExplanation());
        if (removeFromWrongBankBtn) removeFromWrongBankBtn.addEventListener('click', () => this.removeFromWrongBank());

        // 考试模式事件 - 添加安全检查
        const startExamBtn = document.getElementById('startExam');
        const examPrevQuestionBtn = document.getElementById('examPrevQuestion');
        const examNextQuestionBtn = document.getElementById('examNextQuestion');
        const finishExamBtn = document.getElementById('finishExam');
        const reviewExamBtn = document.getElementById('reviewExam');
        const newExamBtn = document.getElementById('newExam');
        
        if (startExamBtn) startExamBtn.addEventListener('click', () => this.startExam());
        if (examPrevQuestionBtn) examPrevQuestionBtn.addEventListener('click', () => this.examPrevQuestion());
        if (examNextQuestionBtn) examNextQuestionBtn.addEventListener('click', () => this.examNextQuestion());
        if (finishExamBtn) finishExamBtn.addEventListener('click', () => this.finishExam());
        if (reviewExamBtn) reviewExamBtn.addEventListener('click', () => this.reviewExam());
        if (newExamBtn) newExamBtn.addEventListener('click', () => this.newExam());

        // 统计页面事件 - 添加安全检查
        const exportStatsBtn = document.getElementById('exportStats');
        const resetStatsBtn = document.getElementById('resetStats');
        const statsFilterSelect = document.getElementById('statsFilter');
        const statsSearchInput = document.getElementById('statsSearch');
        
        if (exportStatsBtn) exportStatsBtn.addEventListener('click', () => this.exportStats());
        if (resetStatsBtn) resetStatsBtn.addEventListener('click', () => this.resetStats());
        if (statsFilterSelect) statsFilterSelect.addEventListener('change', () => this.updateQuestionStatsList());
        if (statsSearchInput) statsSearchInput.addEventListener('input', () => this.updateQuestionStatsList());
    }

    switchMode(mode) {
        // 隐藏所有模式
        document.querySelectorAll('.mode').forEach(m => m.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

        // 显示选中模式 - 添加安全检查
        const modeElement = document.getElementById(`${mode}Mode`);
        const btnElement = document.getElementById(`${mode}Btn`);
        
        if (modeElement) modeElement.classList.add('active');
        if (btnElement) btnElement.classList.add('active');

        this.currentMode = mode;

        // 根据模式执行特定操作
        switch(mode) {
            case 'practice':
                // 切换到练习模式时不再自动显示新题目，因为init时已经处理
                break;
            case 'wrongBank':
                this.updateWrongBankInfo();
                break;
            case 'exam':
                this.resetExamMode();
                break;
            case 'stats':
                this.updateStatsMode();
                break;
        }
    }

    showRandomQuestion() {
        if (this.questions.length === 0) return;

        // 随机选择一道题目
        const randomIndex = Math.floor(Math.random() * this.questions.length);
        this.currentQuestion = this.questions[randomIndex];
        this.currentQuestionIndex = randomIndex;

        this.displayQuestion('practice');
        this.resetQuestionState('practice');
    }

    // 新增：根据设置显示下一题
    showNextQuestion() {
        if (this.questions.length === 0) return;

        if (this.questionOrder === 'sequential') {
            if (this.sequentialIndex >= this.questions.length - 1) {
                this.sequentialIndex = 0; // 如果到了末尾，从头开始
            } else {
                this.sequentialIndex++;
            }
            this.currentQuestion = this.questions[this.sequentialIndex];
            this.currentQuestionIndex = this.sequentialIndex;
            this.saveSetting('sequentialIndex', this.sequentialIndex); // 保存当前进度
        } else {
            // 随机模式
            const randomIndex = Math.floor(Math.random() * this.questions.length);
            this.currentQuestion = this.questions[randomIndex];
            this.currentQuestionIndex = randomIndex;
        }

        this.displayQuestion('practice');
        this.resetQuestionState('practice');
    }

    displayQuestion(mode) {
        const prefix = mode === 'practice' ? '' : mode === 'wrongBank' ? 'wrong' : 'exam';
        const question = mode === 'wrongBank' ? this.wrongQuestions[this.wrongBankIndex] : this.currentQuestion;

        if (!question) return;

        // 显示题目编号和类型
        const isMultiple = Array.isArray(question.answer) && question.answer.length > 1;
        
        // 安全地设置元素内容
        const questionNumberEl = document.getElementById(`${prefix}QuestionNumber`);
        const questionTypeEl = document.getElementById(`${prefix}QuestionType`);
        const questionTextEl = document.getElementById(`${prefix}QuestionText`);
        
        if (questionNumberEl) {
            questionNumberEl.textContent = `题目 ${question.id}`;
        }
        
        if (questionTypeEl) {
            questionTypeEl.textContent = isMultiple ? '多选题' : '单选题';
        }

        // 显示题目图片（如果存在）
        const imageContainer = document.getElementById(`${prefix}QuestionImage`);
        const imgElement = document.getElementById(`${prefix}QuestionImg`);
        
        if (imageContainer && imgElement && this.hasQuestionImage(question.id)) {
            imgElement.src = `${question.id}.jpg`;
            imageContainer.style.display = 'block';
        } else if (imageContainer) {
            imageContainer.style.display = 'none';
        }

        // 显示题目文本 - 支持换行
        if (questionTextEl) {
            const questionText = question.question.replace(/\\n/g, '\n').replace(/\n/g, '<br>');
            questionTextEl.innerHTML = questionText;
        }

        // 显示选项
        this.displayOptions(question, mode);
    }

    hasQuestionImage(questionId) {
        // 检查是否存在对应的图片文件
        const imageFiles = ['122', '123', '168', '169', '215', '220'];
        return imageFiles.includes(questionId.toString());
    }

    displayOptions(question, mode) {
        const prefix = mode === 'practice' ? '' : mode === 'wrongBank' ? 'wrong' : 'exam';
        const optionsContainer = document.getElementById(`${prefix}Options`);
        
        // 添加安全检查
        if (!optionsContainer) {
            console.error(`找不到选项容器: ${prefix}Options`);
            return;
        }
        
        const isMultiple = Array.isArray(question.answer) && question.answer.length > 1;

        optionsContainer.innerHTML = '';

        question.options.forEach((option, index) => {
            const optionLetter = String.fromCharCode(65 + index); // A, B, C, D...
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option';
            optionDiv.onclick = () => this.selectOption(optionDiv, optionLetter, mode);

            const input = document.createElement('input');
            input.type = isMultiple ? 'checkbox' : 'radio';
            input.name = `${prefix}question`;
            input.value = optionLetter;
            input.id = `${prefix}option${optionLetter}`;

            const label = document.createElement('div');
            label.className = 'option-text';
            // 处理换行符，确保正确显示
            const optionText = option.replace(/\\n/g, '\n').replace(/\n/g, '<br>');
            label.innerHTML = `${optionLetter}. ${optionText}`;

            optionDiv.appendChild(input);
            optionDiv.appendChild(label);
            optionsContainer.appendChild(optionDiv);
        });
    }

    selectOption(optionDiv, optionLetter, mode) {
        const prefix = mode === 'practice' ? '' : mode === 'wrongBank' ? 'wrong' : 'exam';
        const question = mode === 'wrongBank' ? this.wrongQuestions[this.wrongBankIndex] : this.currentQuestion;
        const isMultiple = Array.isArray(question.answer) && question.answer.length > 1;
        const input = optionDiv.querySelector('input');

        if (isMultiple) {
            // 多选题
            input.checked = !input.checked;
            optionDiv.classList.toggle('selected', input.checked);
        } else {
            // 单选题
            document.querySelectorAll(`#${prefix}Options .option`).forEach(opt => {
                opt.classList.remove('selected');
                opt.querySelector('input').checked = false;
            });
            input.checked = true;
            optionDiv.classList.add('selected');
        }

        // 如果是考试模式，保存答案
        if (mode === 'exam') {
            this.saveExamAnswer();
        }
    }

    getSelectedAnswers(mode) {
        const prefix = mode === 'practice' ? '' : mode === 'wrongBank' ? 'wrong' : 'exam';
        const selectedInputs = document.querySelectorAll(`#${prefix}Options input:checked`);
        return Array.from(selectedInputs).map(input => input.value);
    }

    submitAnswer() {
        const selectedAnswers = this.getSelectedAnswers('practice');
        if (selectedAnswers.length === 0) {
            alert('请选择答案');
            return;
        }

        this.checkAnswer(selectedAnswers, 'practice');
    }

    submitWrongAnswer() {
        const selectedAnswers = this.getSelectedAnswers('wrongBank');
        if (selectedAnswers.length === 0) {
            alert('请选择答案');
            return;
        }

        this.checkAnswer(selectedAnswers, 'wrongBank');
    }

    checkAnswer(selectedAnswers, mode) {
        const question = mode === 'wrongBank' ? this.wrongQuestions[this.wrongBankIndex] : this.currentQuestion;
        const correctAnswers = Array.isArray(question.answer) ? question.answer : [question.answer];
        
        // 检查答案是否正确
        const isCorrect = this.arraysEqual(selectedAnswers.sort(), correctAnswers.sort());

        // 更新题目统计
        this.updateQuestionStats(question.id, isCorrect);

        // 如果答错了，添加到错题库
        if (!isCorrect && mode === 'practice') {
            this.addToWrongBank(question);
        } else if (isCorrect && mode === 'wrongBank') {
            // 如果在错题库中答对了，显示移除按钮
            document.getElementById('removeFromWrongBank').style.display = 'inline-block';
        }

        // 显示答案状态
        this.showAnswerStatus(selectedAnswers, correctAnswers, mode);

        // 更新按钮状态
        const prefix = mode === 'practice' ? '' : 'wrong';
        document.getElementById(`submit${prefix === '' ? '' : 'Wrong'}Answer`).style.display = 'none';
        document.getElementById(`next${prefix === '' ? '' : 'Wrong'}Question`).style.display = 'inline-block';
        document.getElementById(`show${prefix === '' ? '' : 'Wrong'}Explanation`).style.display = 'inline-block';

        // 更新统计显示
        this.updateStats();
    }

    arraysEqual(a, b) {
        return a.length === b.length && a.every((val, index) => val === b[index]);
    }

    showAnswerStatus(selectedAnswers, correctAnswers, mode) {
        const prefix = mode === 'practice' ? '' : mode === 'wrongBank' ? 'wrong' : 'exam';
        const options = document.querySelectorAll(`#${prefix}Options .option`);

        options.forEach(option => {
            const input = option.querySelector('input');
            const optionLetter = input.value;

            if (correctAnswers.includes(optionLetter)) {
                option.classList.add('correct');
            } else if (selectedAnswers.includes(optionLetter)) {
                option.classList.add('wrong');
            }
        });
    }

    nextQuestion() {
        // 清理当前题目的解析内容
        const explanationEl = document.getElementById('explanation');
        if (explanationEl) explanationEl.style.display = 'none';
        
        this.showNextQuestion();
    }

    nextWrongQuestion() {
        // 清理当前题目的解析内容
        const wrongExplanationEl = document.getElementById('wrongExplanation');
        if (wrongExplanationEl) wrongExplanationEl.style.display = 'none';
        
        this.wrongBankIndex++;
        if (this.wrongBankIndex >= this.wrongQuestions.length) {
            this.wrongBankIndex = 0;
            alert('错题库练习完毕！');
            this.switchMode('wrongBank');
            return;
        }
        this.showWrongBankQuestion();
    }

    showExplanation() {
        const explanationEl = document.getElementById('explanation');
        const explanationTextEl = document.getElementById('explanationText');
        
        if (explanationEl) explanationEl.style.display = 'block';
        if (explanationTextEl) {
            const explanationText = this.currentQuestion.explanation || '暂无解析';
            const formattedText = explanationText.replace(/\\n/g, '\n').replace(/\n/g, '<br>');
            explanationTextEl.innerHTML = formattedText;
        }
    }

    showWrongExplanation() {
        const wrongExplanationEl = document.getElementById('wrongExplanation');
        const wrongExplanationTextEl = document.getElementById('wrongExplanationText');
        
        if (wrongExplanationEl) wrongExplanationEl.style.display = 'block';
        if (wrongExplanationTextEl) {
            const explanationText = this.wrongQuestions[this.wrongBankIndex].explanation || '暂无解析';
            const formattedText = explanationText.replace(/\\n/g, '\n').replace(/\n/g, '<br>');
            wrongExplanationTextEl.innerHTML = formattedText;
        }
    }

    resetQuestionState(mode) {
        const prefix = mode === 'practice' ? '' : mode === 'wrongBank' ? 'wrong' : 'exam';
    
        // 重置选项状态 - 添加安全检查
        const options = document.querySelectorAll(`#${prefix}Options .option`);
        if (options.length > 0) {
            options.forEach(option => {
                option.classList.remove('selected', 'correct', 'wrong');
                const input = option.querySelector('input');
                if (input) input.checked = false;
            });
        }

        // 重置按钮状态 - 添加安全检查
        if (mode !== 'exam') {
            const submitBtn = document.getElementById(`submit${prefix === '' ? '' : 'Wrong'}Answer`);
            const nextBtn = document.getElementById(`next${prefix === '' ? '' : 'Wrong'}Question`);
            const explainBtn = document.getElementById(`show${prefix === '' ? '' : 'Wrong'}Explanation`);
            const explainDiv = document.getElementById(`${prefix}Explanation`);
            
            if (submitBtn) submitBtn.style.display = 'inline-block';
            if (nextBtn) nextBtn.style.display = 'none';
            if (explainBtn) explainBtn.style.display = 'none';
            if (explainDiv) explainDiv.style.display = 'none';
            
            if (mode === 'wrongBank') {
                const removeBtn = document.getElementById('removeFromWrongBank');
                if (removeBtn) removeBtn.style.display = 'none';
            }
        }
    }

    // 错题库相关方法
    updateWrongBankInfo() {
        const wrongBankTotalEl = document.getElementById('wrongBankTotal');
        const wrongBankQuestionsEl = document.getElementById('wrongBankQuestions');
        
        if (wrongBankTotalEl) {
            wrongBankTotalEl.textContent = this.wrongQuestions.length;
        }
        
        if (wrongBankQuestionsEl) {
            wrongBankQuestionsEl.style.display = 'none';
        }
    }

    startWrongBank() {
        if (this.wrongQuestions.length === 0) {
            alert('错题库为空！');
            return;
        }
        this.wrongBankIndex = 0;
        this.showWrongBankQuestion();
        document.getElementById('wrongBankQuestions').style.display = 'block';
    }

    showWrongBankQuestion() {
        if (this.wrongBankIndex >= this.wrongQuestions.length) return;
        
        this.displayQuestion('wrongBank');
        this.resetQuestionState('wrongBank');
    }

    addToWrongBank(question) {
        // 检查是否已存在
        const exists = this.wrongQuestions.some(q => q.id === question.id);
        if (!exists) {
            this.wrongQuestions.push(question);
            this.saveWrongQuestions();
        }
    }

    removeFromWrongBank() {
        const currentQuestion = this.wrongQuestions[this.wrongBankIndex];
        this.wrongQuestions = this.wrongQuestions.filter(q => q.id !== currentQuestion.id);
        this.saveWrongQuestions();
        
        if (this.wrongQuestions.length === 0) {
            alert('错题库已清空！');
            this.switchMode('wrongBank');
        } else {
            if (this.wrongBankIndex >= this.wrongQuestions.length) {
                this.wrongBankIndex = 0;
            }
            this.showWrongBankQuestion();
        }
        
        this.updateStats();
    }

    clearWrongBank() {
        if (confirm('确定要清空错题库吗？')) {
            this.wrongQuestions = [];
            this.saveWrongQuestions();
            this.updateWrongBankInfo();
            this.updateStats();
            alert('错题库已清空！');
        }
    }

    // 考试模式相关方法
    resetExamMode() {
        document.getElementById('examContainer').style.display = 'none';
        document.getElementById('examResult').style.display = 'none';
        document.querySelector('.exam-info').style.display = 'block';
    }

    startExam() {
        if (this.questions.length < 100) {
            alert(`题库题目不足100道，当前只有${this.questions.length}道题目`);
            return;
        }

        // 随机选择100道题目
        this.examQuestions = this.shuffleArray([...this.questions]).slice(0, 100);
        this.currentQuestionIndex = 0;
        this.userAnswers = {};
        this.examDuration = parseInt(document.getElementById('examDuration').value);
        
        // 显示考试界面
        document.querySelector('.exam-info').style.display = 'none';
        document.getElementById('examContainer').style.display = 'flex';
        
        // 开始计时
        this.startExamTimer();
        
        // 生成答题卡
        this.generateAnswerSheet();
        
        // 显示第一题
        this.showExamQuestion();
    }

    shuffleArray(array) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }

    startExamTimer() {
        this.examStartTime = Date.now();
        const endTime = this.examStartTime + this.examDuration * 60 * 1000;
        
        this.examTimer = setInterval(() => {
            const remaining = endTime - Date.now();
            if (remaining <= 0) {
                clearInterval(this.examTimer);
                this.finishExam();
                return;
            }
            
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
            
            document.getElementById('examTimer').textContent = 
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    generateAnswerSheet() {
        const answerSheet = document.getElementById('answerSheet');
        answerSheet.innerHTML = '';
        
        for (let i = 0; i < 100; i++) {
            const answerItem = document.createElement('div');
            answerItem.className = 'answer-item';
            answerItem.textContent = i + 1;
            answerItem.onclick = () => this.jumpToQuestion(i);
            answerSheet.appendChild(answerItem);
        }
        
        this.updateAnswerSheet();
    }

    jumpToQuestion(index) {
        this.currentQuestionIndex = index;
        this.showExamQuestion();
    }

    showExamQuestion() {
        this.currentQuestion = this.examQuestions[this.currentQuestionIndex];
        this.displayQuestion('exam');
        this.resetQuestionState('exam');
        
        // 恢复之前的答案
        this.restoreExamAnswer();
        
        // 更新进度
        this.updateExamProgress();
        
        // 更新按钮状态
        document.getElementById('examPrevQuestion').style.display = 
            this.currentQuestionIndex > 0 ? 'inline-block' : 'none';
        document.getElementById('examNextQuestion').style.display = 
            this.currentQuestionIndex < 99 ? 'inline-block' : 'none';
        document.getElementById('finishExam').style.display = 
            this.currentQuestionIndex === 99 ? 'inline-block' : 'none';
    }

    restoreExamAnswer() {
        const questionId = this.currentQuestion.id;
        const savedAnswer = this.userAnswers[questionId];
        
        if (savedAnswer) {
            savedAnswer.forEach(answer => {
                const option = document.querySelector(`#examOptions input[value="${answer}"]`);
                if (option) {
                    option.checked = true;
                    option.closest('.option').classList.add('selected');
                }
            });
        }
    }

    saveExamAnswer() {
        const selectedAnswers = this.getSelectedAnswers('exam');
        this.userAnswers[this.currentQuestion.id] = selectedAnswers;
        this.updateAnswerSheet();
    }

    updateAnswerSheet() {
        const answerItems = document.querySelectorAll('.answer-item');
        answerItems.forEach((item, index) => {
            item.classList.remove('answered', 'current');
            
            if (index === this.currentQuestionIndex) {
                item.classList.add('current');
            }
            
            const questionId = this.examQuestions[index].id;
            if (this.userAnswers[questionId] && this.userAnswers[questionId].length > 0) {
                item.classList.add('answered');
            }
        });
    }

    updateExamProgress() {
        document.getElementById('examCurrentQ').textContent = this.currentQuestionIndex + 1;
        const progress = ((this.currentQuestionIndex + 1) / 100) * 100;
        document.getElementById('examProgress').style.width = progress + '%';
    }

    examPrevQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
            this.showExamQuestion();
        }
    }

    examNextQuestion() {
        if (this.currentQuestionIndex < 99) {
            this.currentQuestionIndex++;
            this.showExamQuestion();
        }
    }

    finishExam() {
        if (this.examTimer) {
            clearInterval(this.examTimer);
        }
        
        if (!confirm('确定要交卷吗？')) {
            return;
        }
        
        // 计算成绩
        this.calculateExamResult();
    }

    calculateExamResult() {
        let correct = 0;
        let wrong = 0;
        let unanswered = 0;
        
        this.examQuestions.forEach(question => {
            const userAnswer = this.userAnswers[question.id];
            const correctAnswer = Array.isArray(question.answer) ? question.answer : [question.answer];
            
            if (!userAnswer || userAnswer.length === 0) {
                unanswered++;
            } else if (this.arraysEqual(userAnswer.sort(), correctAnswer.sort())) {
                correct++;
                // 更新题目统计
                this.updateQuestionStats(question.id, true);
            } else {
                wrong++;
                // 更新题目统计
                this.updateQuestionStats(question.id, false);
                // 添加到错题库
                this.addToWrongBank(question);
            }
        });
        
        // 显示结果
        document.getElementById('examContainer').style.display = 'none';
        document.getElementById('examResult').style.display = 'block';
        
        document.getElementById('examScore').textContent = correct;
        document.getElementById('examCorrect').textContent = correct;
        document.getElementById('examWrong').textContent = wrong;
        document.getElementById('examUnanswered').textContent = unanswered;
        document.getElementById('examAccuracy').textContent = ((correct / 100) * 100).toFixed(1) + '%';
        
        this.updateStats();
    }

    reviewExam() {
        // 实现考试回顾功能
        alert('考试回顾功能开发中...');
    }

    newExam() {
        this.resetExamMode();
    }

    // 通过ID跳转
    jumpToQuestionById() {
        const input = document.getElementById('jumpToQuestionInput');
        const questionId = input.value;
        if (!questionId) {
            alert('请输入题目ID。');
            return;
        }

        const questionIndex = this.questions.findIndex(q => q.id == questionId);

        if (questionIndex !== -1) {
            this.jumpToQuestionByIndex(questionIndex);
            input.value = '';
        } else {
            alert(`未找到ID为 ${questionId} 的题目。`);
        }
    }

    // 通过索引跳转
    jumpToQuestionByIndex(index, isInitial = false) {
        if (index < 0 || index >= this.questions.length) {
            console.error("跳转索引无效:", index);
            // 如果索引无效，则从第一题开始
            index = 0;
        }
        this.currentQuestion = this.questions[index];
        this.currentQuestionIndex = index;
        
        if (this.questionOrder === 'sequential') {
            this.sequentialIndex = index; // 更新顺序模式的索引
            this.saveSetting('sequentialIndex', this.sequentialIndex); // 保存进度
        }

        if (!isInitial) {
            this.switchMode('practice'); // 确保在练习模式
        }
        
        this.displayQuestion('practice');
        this.resetQuestionState('practice');
    }

    // 统计相关方法
    updateStatsMode() {
        this.updateOverallStats();
        this.updateQuestionStatsList();

        this.saveQuestionStats();
    }

    saveSetting(key, value) {
        try {
            localStorage.setItem(`examSystem_setting_${key}`, JSON.stringify(value));
        } catch (e) {
            console.error("保存设置失败:", e);
        }
    }

    loadSetting(key, defaultValue) {
        try {
            const saved = localStorage.getItem(`examSystem_setting_${key}`);
            if (saved !== null) {
                const parsed = JSON.parse(saved);
                if (typeof parsed === 'number' && parsed >= 0) {
                    return parsed;
                }
            }
            return defaultValue;
        } catch (e) {
            console.error("加载设置失败:", e);
            return defaultValue;
        }
    }

    updateOverallStats() {
        const totalQuestions = this.questions.length;
        const practicedQuestions = Object.keys(this.questionStats).length;
        const practiceRate = totalQuestions > 0 ? ((practicedQuestions / totalQuestions) * 100).toFixed(1) : 0;
        
        let totalCorrect = 0;
        let totalWrong = 0;
        
        Object.values(this.questionStats).forEach(stat => {
            totalCorrect += stat.correct;
            totalWrong += stat.wrong;
        });
        
        const overallAccuracy = (totalCorrect + totalWrong) > 0 ? 
            ((totalCorrect / (totalCorrect + totalWrong)) * 100).toFixed(1) : 0;
        
        document.getElementById('statsTotalQuestions').textContent = totalQuestions;
        document.getElementById('statsPracticedQuestions').textContent = practicedQuestions;
        document.getElementById('statsPracticeRate').textContent = practiceRate + '%';
        document.getElementById('statsTotalCorrect').textContent = totalCorrect;
        document.getElementById('statsTotalWrong').textContent = totalWrong;
        document.getElementById('statsOverallAccuracy').textContent = overallAccuracy + '%';
        document.getElementById('statsWrongTotal').textContent = this.wrongQuestions.length;
    }

    updateQuestionStatsList() {
        const filter = document.getElementById('statsFilter').value;
        const search = document.getElementById('statsSearch').value.toLowerCase();
        const listContainer = document.getElementById('questionStatsList');
        
        listContainer.innerHTML = '';
        
        let filteredQuestions = this.questions.filter(question => {
            const matchesSearch = question.question.toLowerCase().includes(search);
            const stat = this.questionStats[question.id];
            
            switch(filter) {
                case 'correct':
                    return matchesSearch && stat && stat.correct > 0 && stat.wrong === 0;
                case 'wrong':
                    return matchesSearch && stat && stat.wrong > 0;
                case 'unanswered':
                    return matchesSearch && !stat;
                default:
                    return matchesSearch;
            }
        });
        
        filteredQuestions.forEach(question => {
            const stat = this.questionStats[question.id];
            const item = document.createElement('div');
            item.className = 'question-stat-item';
            
            let status = 'unanswered';
            let statusText = '未练习';
            
            if (stat) {
                if (stat.correct > 0 && stat.wrong === 0) {
                    status = 'correct';
                    statusText = '正确';
                } else if (stat.wrong > 0) {
                    status = 'wrong';
                    statusText = '错误';
                }
            }
            
            item.innerHTML = `
                <div class="question-stat-info">
                    <div class="question-stat-title">题目 ${question.id}</div>
                    <div class="question-stat-details">
                        ${question.question.substring(0, 100)}...
                        ${stat ? `答对: ${stat.correct} 次，答错: ${stat.wrong} 次` : ''}
                    </div>
                </div>
                <div class="question-stat-status status-${status}">${statusText}</div>
            `;
            
            listContainer.appendChild(item);
        });
    }

    exportStats() {
        const stats = {
            totalQuestions: this.questions.length,
            questionStats: this.questionStats,
            wrongQuestions: this.wrongQuestions.map(q => q.id),
            exportDate: new Date().toISOString()
        };
        
        const dataStr = JSON.stringify(stats, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `exam_stats_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
    }

    resetStats() {
        if (confirm('确定要重置所有统计数据吗？此操作不可恢复！')) {
            this.questionStats = {};
            this.wrongQuestions = [];
            this.saveQuestionStats();
            this.saveWrongQuestions();
            this.updateStats();
            this.updateStatsMode();
            alert('统计数据已重置！');
        }
    }

    // 数据持久化方法
    updateQuestionStats(questionId, isCorrect) {
        if (!this.questionStats[questionId]) {
            this.questionStats[questionId] = { correct: 0, wrong: 0 };
        }
        
        if (isCorrect) {
            this.questionStats[questionId].correct++;
        } else {
            this.questionStats[questionId].wrong++;
        }
        
        this.saveQuestionStats();
    }

    loadQuestionStats() {
        const saved = localStorage.getItem('examSystem_questionStats');
        return saved ? JSON.parse(saved) : {};
    }

    saveQuestionStats() {
        localStorage.setItem('examSystem_questionStats', JSON.stringify(this.questionStats));
    }

    loadWrongQuestions() {
        const saved = localStorage.getItem('examSystem_wrongQuestions');
        return saved ? JSON.parse(saved) : [];
    }

    saveWrongQuestions() {
        localStorage.setItem('examSystem_wrongQuestions', JSON.stringify(this.wrongQuestions));
    }

    updateStats() {
        let totalCorrect = 0;
        let totalWrong = 0;
        
        Object.values(this.questionStats).forEach(stat => {
            totalCorrect += stat.correct;
            totalWrong += stat.wrong;
        });
        
        // 安全地更新统计显示
        const totalQuestionsEl = document.getElementById('totalQuestions');
        const correctCountEl = document.getElementById('correctCount');
        const wrongCountEl = document.getElementById('wrongCount');
        const wrongBankCountEl = document.getElementById('wrongBankCount');
        
        if (totalQuestionsEl) totalQuestionsEl.textContent = this.questions.length;
        if (correctCountEl) correctCountEl.textContent = totalCorrect;
        if (wrongCountEl) wrongCountEl.textContent = totalWrong;
        if (wrongBankCountEl) wrongBankCountEl.textContent = this.wrongQuestions.length;
    }
}

// 初始化考试系统
document.addEventListener('DOMContentLoaded', () => {
    new ExamSystem();
});
