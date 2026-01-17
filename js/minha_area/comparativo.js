MinhaArea.Comparativo = {
    carregar: async function() {
        console.log("🚀 Detalhamento: Iniciando carregamento...");
        const uid = MinhaArea.getUsuarioAlvo();
        if (!uid) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        
        const container = document.getElementById('container-detalhamento');
        container.innerHTML = '<div class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>Carregando documentos...</div>';

        try {
            // 1. Buscar Dados (Reutilizando a lógica de paginação segura)
            // Trazemos campos essenciais: nome_documento (Categoria), doc_name, status, obs, qtd_nok
            const dados = await this.buscarAuditoriasPaginadas(uid, inicio, fim);

            if (dados.length === 0) {
                container.innerHTML = `
                    <div class="bg-white p-8 rounded-xl border border-slate-200 text-center shadow-sm">
                        <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                            <i class="fas fa-folder-open text-2xl"></i>
                        </div>
                        <h3 class="text-lg font-bold text-slate-700">Nenhum documento auditado</h3>
                        <p class="text-sm text-slate-500 mt-2">Não encontramos registros de auditoria neste período.</p>
                    </div>`;
                return;
            }

            // 2. Agrupar por Categoria (nome_documento)
            const grupos = {};
            dados.forEach(item => {
                // Normaliza o nome da categoria (Vem da coluna DOCUMENTO do CSV)
                const categoria = item.nome_documento || 'OUTROS DOCUMENTOS';
                
                if (!grupos[categoria]) {
                    grupos[categoria] = {
                        docs: [],
                        total: 0,
                        nok: 0
                    };
                }

                grupos[categoria].docs.push(item);
                grupos[categoria].total++;
                if (Number(item.qtd_nok) > 0) grupos[categoria].nok++;
            });

            // 3. Renderizar Acordeões
            let html = '';
            
            // Ordena categorias alfabeticamente
            const categoriasOrdenadas = Object.keys(grupos).sort();

            categoriasOrdenadas.forEach((cat, index) => {
                const grupo = grupos[cat];
                const temErro = grupo.nok > 0;
                const corBorda = temErro ? 'border-l-rose-500' : 'border-l-emerald-500';
                const corIcone = temErro ? 'text-rose-500' : 'text-emerald-500';
                const icone = temErro ? 'fa-exclamation-circle' : 'fa-check-circle';
                
                // Cabeçalho do Acordeão
                html += `
                <div class="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mb-3">
                    <div onclick="MinhaArea.Comparativo.toggleAccordion('acc-${index}')" 
                         class="p-4 cursor-pointer hover:bg-slate-50 transition flex justify-between items-center border-l-4 ${corBorda}">
                        
                        <div class="flex items-center gap-3">
                            <i class="fas ${icone} ${corIcone} text-xl"></i>
                            <div>
                                <h3 class="font-bold text-slate-700 text-sm uppercase tracking-wide">${cat}</h3>
                                <p class="text-xs text-slate-500 mt-0.5">
                                    ${grupo.total} documentos 
                                    ${temErro ? `<span class="text-rose-600 font-bold ml-1">(${grupo.nok} com erros)</span>` : '<span class="text-emerald-600 font-bold ml-1">(100% Aprovado)</span>'}
                                </p>
                            </div>
                        </div>

                        <div class="text-slate-400">
                            <i id="icon-acc-${index}" class="fas fa-chevron-down transition-transform duration-300"></i>
                        </div>
                    </div>

                    <div id="acc-${index}" class="hidden border-t border-slate-100 bg-slate-50/50">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left details-table">
                                <thead>
                                    <tr>
                                        <th class="w-[100px]">Data</th>
                                        <th class="w-[250px]">Nome do Arquivo</th>
                                        <th class="w-[100px] text-center">Status</th>
                                        <th class="w-[80px] text-center">Assert.</th>
                                        <th>Observações / Apontamentos</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.renderizarLinhasTabela(grupo.docs)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>`;
            });

            container.innerHTML = html;

        } catch (err) {
            console.error(err);
            container.innerHTML = '<div class="text-red-500 text-center py-8">Erro ao carregar detalhamento.</div>';
        }
    },

    renderizarLinhasTabela: function(docs) {
        // Ordena por data (mais recente primeiro)
        docs.sort((a, b) => new Date(b.data_auditoria) - new Date(a.data_auditoria));

        return docs.map(doc => {
            const dataBR = doc.data_auditoria ? new Date(doc.data_auditoria).toLocaleDateString('pt-BR') : '-';
            const status = (doc.status || '').toUpperCase();
            const obs = doc.observacao || doc.obs || '<span class="text-slate-300 italic">Sem observações</span>';
            const pct = doc.porcentagem || '-';
            
            // Estilização do Status
            let badgeClass = 'bg-slate-100 text-slate-600';
            if (status === 'OK') badgeClass = 'bg-emerald-100 text-emerald-700 border border-emerald-200';
            else if (status === 'NOK') badgeClass = 'bg-rose-100 text-rose-700 border border-rose-200';
            else if (['REV', 'EMPR', 'JUST'].includes(status)) badgeClass = 'bg-amber-50 text-amber-700 border border-amber-200';

            return `
                <tr class="hover:bg-white transition">
                    <td class="font-mono text-xs text-slate-500">${dataBR}</td>
                    <td class="font-bold text-slate-700 truncate max-w-[250px]" title="${doc.doc_name}">${doc.doc_name}</td>
                    <td class="text-center">
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded ${badgeClass}">${status}</span>
                    </td>
                    <td class="text-center font-bold text-xs ${parseFloat(pct) < 100 ? 'text-rose-600' : 'text-emerald-600'}">${pct}</td>
                    <td class="text-xs text-slate-600 leading-relaxed max-w-[400px] break-words">${obs}</td>
                </tr>
            `;
        }).join('');
    },

    toggleAccordion: function(id) {
        const content = document.getElementById(id);
        const icon = document.getElementById('icon-' + id);
        
        if (content.classList.contains('hidden')) {
            content.classList.remove('hidden');
            icon.classList.add('rotate-180');
        } else {
            content.classList.add('hidden');
            icon.classList.remove('rotate-180');
        }
    },

    buscarAuditoriasPaginadas: async function(uid, inicio, fim) {
        let todos = [];
        let page = 0;
        const size = 1000;
        let continuar = true;

        while(continuar) {
            // Seleciona colunas extras para o detalhamento: nome_documento (Categoria), doc_name, obs
            const { data, error } = await Sistema.supabase
                .from('assertividade')
                .select('*') 
                .eq('usuario_id', uid)
                .gte('data_auditoria', inicio)
                .lte('data_auditoria', fim)
                .neq('auditora', null) 
                .neq('auditora', '')
                .range(page * size, (page + 1) * size - 1);

            if(error) throw error;

            todos = todos.concat(data);
            if(data.length < size) continuar = false;
            else page++;
        }
        return todos;
    }
};