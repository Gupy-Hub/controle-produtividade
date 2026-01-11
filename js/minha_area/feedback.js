MinhaArea.Feedback = {
    carregar: async function() {
        const container = document.getElementById('ma-tab-feedback');
        const uid = MinhaArea.user.id;

        // Limpa e mostra loading
        container.innerHTML = `
            <div class="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
                <i class="fas fa-spinner fa-spin text-3xl text-blue-500 mb-4"></i>
                <p class="text-slate-500">A carregar feedbacks...</p>
            </div>
        `;

        try {
            // Tenta buscar feedbacks do banco
            // Estrutura esperada: id, tipo (Elogio, Correção, Aviso), mensagem, data_criacao, lido
            const { data, error } = await MinhaArea.supabase
                .from('feedbacks')
                .select('*')
                .eq('usuario_id', uid)
                .order('created_at', { ascending: false });

            if (error) {
                // Se a tabela não existir, mostra mensagem amigável (sem quebrar a aplicação)
                if(error.code === '42P01') { 
                    this.renderizarVazio(container, "O módulo de feedback ainda não foi configurado no banco de dados.");
                    return;
                }
                throw error;
            }

            if (!data || data.length === 0) {
                this.renderizarVazio(container, "Nenhum feedback recebido ainda.");
                return;
            }

            this.renderizarLista(container, data);

        } catch (e) {
            console.error("Erro Feedback:", e);
            container.innerHTML = `<div class="bg-red-50 p-4 rounded-lg text-red-600 text-center">Erro ao carregar: ${e.message}</div>`;
        }
    },

    renderizarLista: function(container, lista) {
        let html = '<div class="space-y-4">';

        lista.forEach(item => {
            // Define estilos baseados no tipo
            let icon = 'fa-comment';
            let colorClass = 'bg-slate-50 border-slate-200 text-slate-700';
            let iconColor = 'text-slate-400';

            if (item.tipo === 'Elogio') {
                icon = 'fa-star';
                colorClass = 'bg-amber-50 border-amber-200';
                iconColor = 'text-amber-500';
            } else if (item.tipo === 'Correção') {
                icon = 'fa-exclamation-circle';
                colorClass = 'bg-red-50 border-red-200';
                iconColor = 'text-red-500';
            } else if (item.tipo === 'Aviso') {
                icon = 'fa-info-circle';
                colorClass = 'bg-blue-50 border-blue-200';
                iconColor = 'text-blue-500';
            }

            const dataFmt = new Date(item.created_at).toLocaleDateString('pt-BR');

            html += `
            <div class="p-5 rounded-2xl border ${colorClass} shadow-sm flex gap-4 animate-enter relative overflow-hidden">
                <div class="flex-shrink-0">
                    <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center text-lg ${iconColor} shadow-sm">
                        <i class="fas ${icon}"></i>
                    </div>
                </div>
                <div class="flex-1">
                    <div class="flex justify-between items-start mb-1">
                        <h4 class="font-bold text-slate-800">${item.tipo || 'Mensagem'}</h4>
                        <span class="text-xs font-bold text-slate-400">${dataFmt}</span>
                    </div>
                    <p class="text-sm text-slate-600 leading-relaxed">${item.mensagem}</p>
                </div>
                ${!item.lido ? '<div class="absolute top-0 right-0 w-3 h-3 bg-blue-500 rounded-full -mr-1 -mt-1 border-2 border-white"></div>' : ''}
            </div>`;
        });

        html += '</div>';
        container.innerHTML = html;
    },

    renderizarVazio: function(container, msg) {
        container.innerHTML = `
            <div class="bg-white p-10 rounded-2xl shadow-sm border border-slate-200 text-center">
                <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300 text-2xl">
                    <i class="fas fa-inbox"></i>
                </div>
                <h3 class="text-lg font-bold text-slate-700">Tudo limpo!</h3>
                <p class="text-slate-500 text-sm mt-2">${msg}</p>
            </div>
        `;
    }
};